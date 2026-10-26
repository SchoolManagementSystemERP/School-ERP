import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { componentsOf, grossOf, hrSettings, monthlyPayslip } from '../../lib/payroll.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { assertHr, canManageHr, daysInMonth, hrBranches, ownStaff, staffOrThrow, todayUtc } from './common.js';
import { leaveBalances, lopDays } from './workforce.routes.js';

/**
 * Exits: resignation (by the employee) or separation (by HR), acceptance, exit interview, handover
 * checklist, the full & final settlement (sent to Accounts as a payable) and the exit documents.
 */
export const exitRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const DAY = 86_400_000;
const r = (n: number) => Math.round(n);

const DEFAULT_HANDOVER = [
  'Lesson plans, registers and records handed over', 'Pending marks / assignments completed', 'Library books returned',
  'Lab / store items and keys returned', 'ID card returned', 'ERP sign-in and email closed',
];

type SepRow = { id: string; branchId: string; staffId: string; type: string; noticeDate: Date; lastWorkingDay: Date; reason: string; letter: string | null; status: string; exitInterview: string | null; handover: string | null; fnf: string | null; expenseId: string | null; settledAt: Date | null; createdAt: Date };
const sepOut = (s: SepRow, staff?: { name: string; employeeCode: string; designation: string; department: string | null }) => ({
  id: s.id, staffId: s.staffId, staff: staff ?? null, type: s.type, noticeDate: toDateString(s.noticeDate), lastWorkingDay: toDateString(s.lastWorkingDay), reason: s.reason, letter: s.letter,
  status: s.status, exitInterview: parseJson(s.exitInterview), handover: (parseJson(s.handover) as { item: string; owner: string; done: boolean }[] | null) ?? [],
  fnf: parseJson(s.fnf), sentToAccounts: !!s.expenseId, settledAt: s.settledAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(),
});

async function sepOrThrow(tx: Tx, id: string) {
  const s = await tx.separation.findUnique({ where: { id } });
  if (!s) throw notFound('Separation');
  return s;
}

/** HR, or the employee concerned. */
async function assertHrOrSelf(tx: Tx, ctx: RequestContext, s: { branchId: string; staffId: string }) {
  if (canManageHr(ctx, s.branchId)) return 'hr' as const;
  if ((await ownStaff(tx, ctx))?.id === s.staffId) return 'self' as const;
  throw notFound('Separation');
}

/** GET /separations?mine=1 — HR: the branch's exits; employees (or mine=1): their own. */
exitRouter.get('/separations', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const branches = req.query.mine === '1' ? [] : hrBranches(ctx);
    let rows;
    if (branches.length) rows = await tx.separation.findMany({ where: { branchId: { in: branches } }, orderBy: { createdAt: 'desc' } });
    else {
      const me = await ownStaff(tx, ctx);
      if (!me) throw forbidden();
      rows = await tx.separation.findMany({ where: { staffId: me.id }, orderBy: { createdAt: 'desc' } });
    }
    const staff = new Map((await tx.staff.findMany({ where: { id: { in: rows.map((s) => s.staffId) } }, select: { id: true, name: true, employeeCode: true, designation: true, department: true } })).map((s) => [s.id, s]));
    return rows.map((s) => sepOut(s, staff.get(s.staffId)));
  });
  res.json(out);
});

/**
 * POST /separations — an employee resigns (with their letter), or HR records a separation for someone
 * (termination, retirement, end of contract). The last working day defaults to the notice period.
 */
exitRouter.post('/separations', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    staffId: uuid.optional(), type: z.enum(['RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_END']).default('RESIGNATION'),
    reason: z.string().trim().min(3).max(500), letter: z.string().trim().max(10000).nullable().optional(), lastWorkingDay: dateOnly.optional(),
  }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const me = await ownStaff(tx, ctx);
    const staffId = body.staffId ?? me?.id;
    if (!staffId) throw badRequest('Choose the employee.');
    const staff = await staffOrThrow(tx, staffId);
    const self = staffId === me?.id;
    if (!self && !canManageHr(ctx, staff.branchId)) throw forbidden();
    if (self && body.type !== 'RESIGNATION') throw forbidden('Only HR can record this kind of separation.');
    if (staff.status === 'RESIGNED') throw conflict('This employee has already left.');
    if (await tx.separation.count({ where: { staffId, status: { in: ['REQUESTED', 'ACCEPTED', 'CLEARANCE'] } } })) throw conflict('An exit is already in progress for this employee.');
    const s = await hrSettings(tx, ctx.organizationId);
    const noticeDate = todayUtc();
    const lastWorkingDay = body.lastWorkingDay ?? new Date(noticeDate.getTime() + s.noticeDays * DAY);
    if (lastWorkingDay < noticeDate) throw badRequest('The last working day cannot be in the past.');
    const sep = await tx.separation.create({
      data: { organizationId: ctx.organizationId, branchId: staff.branchId, staffId, type: body.type, noticeDate, lastWorkingDay, reason: body.reason, letter: body.letter ?? null, status: self ? 'REQUESTED' : 'ACCEPTED', acceptedById: self ? null : ctx.userId, handover: self ? null : JSON.stringify(DEFAULT_HANDOVER.map((item) => ({ item, owner: '', done: false }))) },
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Separation', entityId: sep.id, branchId: staff.branchId, after: { type: body.type, lastWorkingDay: toDateString(lastWorkingDay) } });
    return sepOut(sep, staff);
  });
  res.status(201).json(out);
});

/** PATCH /separations/:id — HR accepts (may change the last working day) or rejects; the employee or HR may withdraw before settlement. */
exitRouter.patch('/separations/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ action: z.enum(['ACCEPT', 'REJECT', 'WITHDRAW']), lastWorkingDay: dateOnly.optional(), remark: z.string().trim().max(300).optional() }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const s = await sepOrThrow(tx, id);
    const who = await assertHrOrSelf(tx, ctx, s);
    if (body.action !== 'WITHDRAW' && who !== 'hr') throw forbidden();
    let data: Record<string, unknown>;
    if (body.action === 'ACCEPT') {
      if (s.status !== 'REQUESTED') throw conflict(`This exit is ${s.status.toLowerCase()}.`);
      const lwd = body.lastWorkingDay ?? s.lastWorkingDay;
      if (lwd < s.noticeDate) throw badRequest('The last working day cannot be before the notice date.');
      data = { status: 'ACCEPTED', lastWorkingDay: lwd, acceptedById: ctx.userId, handover: s.handover ?? JSON.stringify(DEFAULT_HANDOVER.map((item) => ({ item, owner: '', done: false }))) };
    } else if (body.action === 'REJECT') {
      if (s.status !== 'REQUESTED') throw conflict(`This exit is ${s.status.toLowerCase()}.`);
      if (!body.remark) throw badRequest('Give a reason.');
      data = { status: 'REJECTED' };
    } else {
      if (!['REQUESTED', 'ACCEPTED', 'CLEARANCE'].includes(s.status)) throw conflict(`This exit is ${s.status.toLowerCase()}.`);
      data = { status: 'WITHDRAWN' };
    }
    const updated = await tx.separation.update({ where: { id }, data });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Separation', entityId: id, branchId: s.branchId, before: { status: s.status }, after: { ...body, lastWorkingDay: toDateString(body.lastWorkingDay ?? null) } });
    return sepOut(updated);
  });
  res.json(out);
});

/** PUT /separations/:id/exit-interview — the employee's (or HR's) exit interview answers. */
exitRouter.put('/separations/:id/exit-interview', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const rating = z.number().int().min(1).max(5);
  const body = z.object({
    primaryReason: z.string().trim().min(2).max(100), workEnvironment: rating, management: rating, growth: rating, compensation: rating,
    wouldRecommend: z.boolean(), wouldRejoin: z.boolean(), suggestions: z.string().trim().max(2000).optional(),
  }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const s = await sepOrThrow(tx, id);
    await assertHrOrSelf(tx, ctx, s);
    if (!['ACCEPTED', 'CLEARANCE'].includes(s.status)) throw conflict('The exit interview happens after the exit is accepted.');
    await tx.separation.update({ where: { id }, data: { exitInterview: JSON.stringify({ ...body, recordedAt: new Date().toISOString() }) } });
  });
  res.json({ ok: true });
});

/** PUT /separations/:id/handover — the handover / clearance checklist (HR). */
exitRouter.put('/separations/:id/handover', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ items: z.array(z.object({ item: z.string().trim().min(2).max(200), owner: z.string().trim().max(150), done: z.boolean() })).min(1).max(40) }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const s = await sepOrThrow(tx, id);
    assertHr(ctx, s.branchId);
    if (!['ACCEPTED', 'CLEARANCE'].includes(s.status)) throw conflict(`This exit is ${s.status.toLowerCase()}.`);
    await tx.separation.update({ where: { id }, data: { handover: JSON.stringify(body.items) } });
  });
  res.json({ ok: true });
});

/** Works out the full & final settlement. */
async function computeFnf(tx: Tx, ctx: RequestContext, s: SepRow, adj: { bonus?: number; noticeRecovery?: number; otherEarnings?: number; otherDeductions?: number; remarks?: string }) {
  const staff = await staffOrThrow(tx, s.staffId);
  const settings = await hrSettings(tx, ctx.organizationId);
  const c = componentsOf(staff);
  const monthlyGross = grossOf(c);
  const lwd = s.lastWorkingDay;
  const month = lwd.toISOString().slice(0, 7);
  const dim = daysInMonth(month);

  // salary for the last month, unless that month's payroll already paid it
  const run = await tx.payrollRun.findUnique({ where: { branchId_month: { branchId: s.branchId, month } }, include: { payslips: { where: { staffId: s.staffId } } } });
  const paidByPayroll = !!run?.payslips.length;
  const workedDays = lwd.getUTCDate();
  const lop = paidByPayroll ? 0 : (await lopDays(tx, [s.staffId], month)).get(s.staffId) ?? 0;
  const salary = paidByPayroll ? null : monthlyPayslip(c, settings, { daysInMonth: dim, lopDays: dim - workedDays + lop });

  // earned leave encashment
  const el = (await leaveBalances(tx, [s.staffId], settings)).get(s.staffId)?.find((b) => b.type === 'EARNED');
  const encashDays = el?.balance ?? 0;
  const encashment = r((encashDays * (c.basic + c.da)) / settings.encashmentDivisor);

  // statutory bonus for this financial year, for eligible wages
  const fyStart = new Date(Date.UTC(lwd.getUTCMonth() >= 3 ? lwd.getUTCFullYear() : lwd.getUTCFullYear() - 1, 3, 1));
  const from = staff.joiningDate && staff.joiningDate > fyStart ? staff.joiningDate : fyStart;
  const monthsInFy = Math.max(0, (lwd.getUTCFullYear() - from.getUTCFullYear()) * 12 + lwd.getUTCMonth() - from.getUTCMonth() + 1);
  const bonusEligible = monthlyGross > 0 && monthlyGross <= settings.bonusWageCeiling;
  const bonus = adj.bonus ?? (bonusEligible ? r(((c.basic + c.da) * settings.bonusPercent * monthsInFy) / 100) : 0);

  // gratuity after 5 years (4 years 240 days) of service: 15/26 × last basic + DA × completed years
  const serviceYears = staff.joiningDate ? (lwd.getTime() - staff.joiningDate.getTime()) / (365.25 * DAY) : 0;
  const completedYears = Math.floor(serviceYears) + (serviceYears % 1 >= 0.5 ? 1 : 0);
  const gratuity = serviceYears >= 4 + 240 / 365 ? Math.min(2000000, r(((c.basic + c.da) * 15 * completedYears) / 26)) : 0;

  // approved claims not yet paid with salary
  const claims = await tx.expenseClaim.findMany({ where: { staffId: s.staffId, status: 'APPROVED', paidMonth: null } });
  const claimsTotal = r(claims.reduce((t, x) => t + Number(x.amount), 0));

  // notice period shortfall (resignations)
  const served = Math.round((lwd.getTime() - s.noticeDate.getTime()) / DAY) + 1;
  const shortfall = s.type === 'RESIGNATION' ? Math.max(0, settings.noticeDays - served) : 0;
  const noticeRecovery = adj.noticeRecovery ?? r((monthlyGross / 30) * shortfall);

  const earnings = [
    ...(salary ? [{ label: `Salary for ${workedDays - lop} day(s) of ${month}`, amount: salary.gross }] : []),
    { label: `Leave encashment (${encashDays} earned-leave days)`, amount: encashment },
    { label: bonusEligible ? `Bonus (${settings.bonusPercent}% for ${monthsInFy} month(s))` : 'Bonus (not eligible — wages above the bonus ceiling)', amount: bonus },
    { label: gratuity ? `Gratuity (${completedYears} year(s) of service)` : `Gratuity (not eligible — ${serviceYears.toFixed(1)} years of service)`, amount: gratuity },
    { label: `Approved expense claims (${claims.length})`, amount: claimsTotal },
    ...(adj.otherEarnings ? [{ label: 'Other earnings', amount: r(adj.otherEarnings) }] : []),
  ];
  const deductions = [
    ...(salary ? [{ label: 'PF (employee)', amount: salary.deductionsDetail.pf }, { label: 'ESI (employee)', amount: salary.deductionsDetail.esi }, { label: 'Professional tax', amount: salary.deductionsDetail.pt }, { label: 'TDS', amount: salary.deductionsDetail.tds }] : []),
    { label: shortfall ? `Notice period shortfall (${shortfall} day(s))` : 'Notice period recovery', amount: noticeRecovery },
    ...(adj.otherDeductions ? [{ label: 'Other recoveries (advances, assets…)', amount: r(adj.otherDeductions) }] : []),
  ].filter((d) => d.amount > 0 || d.label.startsWith('Notice'));
  const totalEarnings = earnings.reduce((t, e) => t + e.amount, 0);
  const totalDeductions = deductions.reduce((t, d) => t + d.amount, 0);
  return {
    computedAt: new Date().toISOString(), lastWorkingDay: toDateString(lwd), salaryPaidByPayroll: paidByPayroll, serviceYears: Math.round(serviceYears * 10) / 10,
    earnings, deductions, totalEarnings, totalDeductions, net: totalEarnings - totalDeductions, claimIds: claims.map((x) => x.id), remarks: adj.remarks ?? null,
  };
}

/** POST /separations/:id/fnf — calculates (or recalculates) the full & final settlement; HR may adjust bonus and recoveries. */
exitRouter.post('/separations/:id/fnf', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const amt = z.number().min(0).max(10_000_000);
  const body = z.object({ bonus: amt.optional(), noticeRecovery: amt.optional(), otherEarnings: amt.optional(), otherDeductions: amt.optional(), remarks: z.string().trim().max(500).optional() }).parse(req.body ?? {});
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const s = await sepOrThrow(tx, id);
    assertHr(ctx, s.branchId);
    if (!['ACCEPTED', 'CLEARANCE'].includes(s.status)) throw conflict(`This exit is ${s.status.toLowerCase()} — accept it first.`);
    const fnf = await computeFnf(tx, ctx, s, body);
    await tx.separation.update({ where: { id }, data: { fnf: JSON.stringify(fnf), status: 'CLEARANCE' } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'FullAndFinal', entityId: id, branchId: s.branchId, after: { net: fnf.net, ...body } });
    return fnf;
  });
  res.json(out);
});

/**
 * POST /separations/:id/settle — closes the exit: needs the handover done, the last working day reached
 * and the full & final calculated. The payable goes to Accounts (an expense), approved claims are marked
 * paid, the employee is marked as left and their sign-in is switched off.
 */
exitRouter.post('/separations/:id/settle', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const s = await sepOrThrow(tx, id);
    if (!canManageHr(ctx, s.branchId) && !ctx.access.can('payroll.run', s.branchId)) throw forbidden();
    if (s.status !== 'CLEARANCE' || !s.fnf) throw conflict('Calculate the full & final settlement first.');
    if (s.lastWorkingDay > todayUtc()) throw conflict('The employee has not reached their last working day yet.');
    const handover = (parseJson(s.handover) as { done: boolean }[] | null) ?? [];
    if (handover.some((h) => !h.done)) throw conflict('Finish the handover checklist first.');
    const fnf = parseJson(s.fnf) as { net: number; claimIds: string[] };
    const staff = await staffOrThrow(tx, s.staffId);
    const expense = fnf.net > 0
      ? await tx.expense.create({ data: { organizationId: ctx.organizationId, branchId: s.branchId, date: todayUtc(), category: 'Full & Final Settlement', description: `F&F — ${staff.name} (${staff.employeeCode}), last day ${toDateString(s.lastWorkingDay)}`, amount: fnf.net, paidTo: staff.name, method: 'BANK_TRANSFER', createdById: ctx.userId } })
      : null;
    await tx.expenseClaim.updateMany({ where: { id: { in: fnf.claimIds ?? [] }, status: 'APPROVED' }, data: { status: 'PAID', paidMonth: 'FNF' } });
    await tx.staff.update({ where: { id: staff.id }, data: { status: 'RESIGNED' } });
    if (staff.userId) {
      await tx.user.update({ where: { id: staff.userId }, data: { isActive: false } });
      await tx.refreshToken.updateMany({ where: { userId: staff.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    const updated = await tx.separation.update({ where: { id }, data: { status: 'SETTLED', settledAt: new Date(), expenseId: expense?.id ?? null } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Separation', entityId: id, branchId: s.branchId, before: { status: s.status }, after: { status: 'SETTLED', net: fnf.net, expenseId: expense?.id ?? null } });
    return sepOut(updated);
  });
  res.json(out);
});

/** GET /separations/:id/documents — what the letters need (school, employee, dates). Experience and relieving letters only once settled. */
exitRouter.get('/separations/:id/documents', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const s = await sepOrThrow(tx, id);
    await assertHrOrSelf(tx, ctx, s);
    const staff = await staffOrThrow(tx, s.staffId);
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: s.branchId }, select: { name: true, address: true, city: true, state: true, phone: true, email: true } });
    const principal = await tx.membership.findFirst({ where: { branchId: s.branchId, isActive: true, role: { code: 'PRINCIPAL' } }, select: { user: { select: { name: true } } } });
    return {
      school: branch, principalName: principal?.user.name ?? 'Principal',
      employee: { name: staff.name, employeeCode: staff.employeeCode, designation: staff.designation, department: staff.department, joiningDate: toDateString(staff.joiningDate), gender: staff.gender },
      separation: { type: s.type, noticeDate: toDateString(s.noticeDate), lastWorkingDay: toDateString(s.lastWorkingDay), reason: s.reason, letter: s.letter, status: s.status, settledAt: s.settledAt?.toISOString() ?? null },
      available: { resignationLetter: !!s.letter, acceptanceLetter: ['ACCEPTED', 'CLEARANCE', 'SETTLED'].includes(s.status), experienceCertificate: s.status === 'SETTLED', relievingLetter: s.status === 'SETTLED' },
    };
  });
  res.json(out);
});
