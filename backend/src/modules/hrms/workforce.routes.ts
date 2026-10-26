import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { ctcBreakdown, DEFAULT_HR_SETTINGS, hrSettings, type HrSettings } from '../../lib/payroll.js';
import { ctxOf } from '../../middleware/authenticate.js';
import {
  assertHr, canApprove, canManageHr, createOnboardingTasks, daysInMonth, hrBranches, nextDocNo, ownStaff, staffOrThrow, todayUtc, toMonthStart,
} from './common.js';

/**
 * Day-to-day HR: settings, CTC calculator and salary structures, background verification, onboarding,
 * staff attendance, leave balances, expense claims, payslips and the statutory compliance report.
 */
export const workforceRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const money = (d: unknown) => Math.round(Number(d ?? 0) * 100) / 100;
const DAY = 86_400_000;

// ═════════════════════════════════════════════════════════════════════════════
// Settings & compensation
// ═════════════════════════════════════════════════════════════════════════════

/** GET /hr/settings — salary and leave rules (HR, accounts). */
workforceRouter.get('/hr/settings', async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere('staff.write') && !ctx.access.canAnywhere('payroll.run') && !ctx.access.canAnywhere('leave.approve')) throw forbidden();
  res.json(await withTenant(ctx.organizationId, (tx) => hrSettings(tx, ctx.organizationId)));
});

/** PUT /hr/settings — needs staff.write anywhere or org.manage. */
workforceRouter.put('/hr/settings', async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere('staff.write') && !ctx.access.can('org.manage')) throw forbidden();
  const pct = z.number().min(0).max(100);
  const body = z.object({
    basicPercent: pct, hraPercentOfBasic: pct, pfRate: pct, pfWageCeiling: z.number().min(0), pfOnActualBasic: z.boolean(),
    esiWageCeiling: z.number().min(0), esiEmployeeRate: pct, esiEmployerRate: pct, gratuityPercent: pct,
    professionalTax: z.array(z.object({ from: z.number().min(0), amount: z.number().min(0).max(2500) })).max(20),
    leavePolicy: z.record(z.number().int().min(0).max(365)), noticeDays: z.number().int().min(0).max(180),
    encashmentDivisor: z.number().int().min(1).max(31), bonusPercent: pct, bonusWageCeiling: z.number().min(0),
  }).partial().parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } });
    const all = (parseJson(org.settings) ?? {}) as Record<string, unknown>;
    const hr = { ...DEFAULT_HR_SETTINGS, ...(all.hr as object), ...body } as HrSettings;
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: JSON.stringify({ ...all, hr }) } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'HrSettings', entityId: ctx.organizationId, after: body });
    return hr;
  });
  res.json(out);
});

/** POST /hr/ctc/preview — the CTC annexure for an annual CTC (nothing is saved). */
workforceRouter.post('/hr/ctc/preview', async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere('staff.write') && !ctx.access.canAnywhere('payroll.run')) throw forbidden();
  const body = z.object({ ctcAnnual: z.number().min(10000).max(100_000_000), basicPercent: z.number().min(10).max(80).optional(), hraPercentOfBasic: z.number().min(0).max(100).optional() }).parse(req.body);
  const s = await withTenant(ctx.organizationId, (tx) => hrSettings(tx, ctx.organizationId));
  res.json(ctcBreakdown(body.ctcAnnual, s, body));
});

/** PUT /staff/:id/compensation — enrols an employee in payroll with a salary structure from their CTC. */
workforceRouter.put('/staff/:id/compensation', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ ctcAnnual: z.number().min(10000).max(100_000_000), basicPercent: z.number().min(10).max(80).optional(), hraPercentOfBasic: z.number().min(0).max(100).optional() }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const staff = await staffOrThrow(tx, id);
    if (!canManageHr(ctx, staff.branchId) && !ctx.access.can('payroll.run', staff.branchId)) throw forbidden();
    const b = ctcBreakdown(body.ctcAnnual, await hrSettings(tx, ctx.organizationId), body);
    await tx.staff.update({
      where: { id },
      data: {
        compensation: JSON.stringify({ ...b, effectiveFrom: todayUtc().toISOString().slice(0, 10) }),
        basicSalary: b.monthly.basic,
        allowances: JSON.stringify({ hra: b.monthly.hra, da: b.monthly.da, ta: b.monthly.ta, other: b.monthly.special }),
      },
    });
    await tx.onboardingTask.updateMany({ where: { staffId: id, taskKey: 'payroll', done: false }, data: { done: true, doneAt: new Date(), doneById: ctx.userId } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Compensation', entityId: id, branchId: staff.branchId, before: { compensation: parseJson(staff.compensation) ? 'set' : null, basicSalary: money(staff.basicSalary) }, after: { ctcAnnual: b.ctcAnnual } });
    return b;
  });
  res.json(out);
});

/** GET /staff/:id/compensation — HR / accounts, or the employee themself. */
workforceRouter.get('/staff/:id/compensation', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const staff = await staffOrThrow(tx, id);
    if (!canManageHr(ctx, staff.branchId) && !ctx.access.can('payroll.run', staff.branchId) && staff.userId !== ctx.userId) throw forbidden();
    return parseJson(staff.compensation);
  });
  res.json(out);
});

/** PATCH /staff/:id/bgv — background verification status. */
workforceRouter.patch('/staff/:id/bgv', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ status: z.enum(['PENDING', 'IN_PROGRESS', 'CLEAR', 'FLAGGED']), note: z.string().trim().max(300).optional() }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const staff = await staffOrThrow(tx, id);
    assertHr(ctx, staff.branchId);
    await tx.staff.update({ where: { id }, data: { bgvStatus: body.status } });
    if (body.status === 'CLEAR' || body.status === 'FLAGGED') {
      await tx.onboardingTask.updateMany({ where: { staffId: id, taskKey: 'bgv' }, data: { done: body.status === 'CLEAR', doneAt: new Date(), doneById: ctx.userId, note: body.note ?? (body.status === 'FLAGGED' ? 'Flagged — see HR' : null) } });
    }
    await audit(tx, ctx, { action: 'UPDATE', entity: 'BackgroundVerification', entityId: id, branchId: staff.branchId, before: { status: staff.bgvStatus }, after: body });
  });
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// Onboarding
// ═════════════════════════════════════════════════════════════════════════════

/** GET /onboarding — employees with joining formalities (open ones first). */
workforceRouter.get('/onboarding', async (req, res) => {
  const ctx = ctxOf(req);
  const branches = hrBranches(ctx);
  if (!branches.length) throw forbidden();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const tasks = await tx.onboardingTask.findMany({ orderBy: { sortOrder: 'asc' } });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(tasks.map((t) => t.staffId))] }, branchId: { in: branches } }, select: { id: true, name: true, employeeCode: true, designation: true, department: true, staffType: true, joiningDate: true, bgvStatus: true, userId: true, status: true } });
    return staff
      .map((s) => {
        const mine = tasks.filter((t) => t.staffId === s.id);
        return {
          staffId: s.id, name: s.name, employeeCode: s.employeeCode, designation: s.designation, department: s.department, staffType: s.staffType,
          joiningDate: toDateString(s.joiningDate), bgvStatus: s.bgvStatus, hasLogin: !!s.userId, status: s.status,
          done: mine.filter((t) => t.done).length, total: mine.length,
          tasks: mine.map((t) => ({ id: t.id, key: t.taskKey, title: t.title, category: t.category, done: t.done, doneAt: t.doneAt?.toISOString() ?? null, note: t.note })),
        };
      })
      .sort((a, b) => (a.done === a.total ? 1 : 0) - (b.done === b.total ? 1 : 0) || (b.joiningDate ?? '').localeCompare(a.joiningDate ?? ''));
  });
  res.json(out);
});

/** POST /staff/:id/onboarding — starts the joining checklist for an existing employee. */
workforceRouter.post('/staff/:id/onboarding', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const staff = await staffOrThrow(tx, id);
    assertHr(ctx, staff.branchId);
    const done = ['employee_code', ...(staff.userId ? ['login'] : []), ...(staff.compensation || staff.basicSalary ? ['payroll'] : [])];
    await createOnboardingTasks(tx, ctx, id, staff.staffType, done);
  });
  res.status(201).json({ ok: true });
});

/** PATCH /onboarding/:taskId — tick a formality off (or reopen it). */
workforceRouter.patch('/onboarding/:taskId', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req, 'taskId');
  const body = z.object({ done: z.boolean(), note: z.string().trim().max(300).nullable().optional() }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const t = await tx.onboardingTask.findUnique({ where: { id } });
    if (!t) throw notFound('Task');
    const staff = await staffOrThrow(tx, t.staffId);
    assertHr(ctx, staff.branchId);
    await tx.onboardingTask.update({ where: { id }, data: { done: body.done, doneAt: body.done ? new Date() : null, doneById: body.done ? ctx.userId : null, ...(body.note !== undefined ? { note: body.note } : {}) } });
  });
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// Staff attendance
// ═════════════════════════════════════════════════════════════════════════════

const ATT = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF'] as const;
const canMarkAttendance = (ctx: RequestContext, b: string) => canManageHr(ctx, b) || ctx.access.can('leave.approve', b);

/** Approved leave days of the given staff between two dates: staffId → set of YYYY-MM-DD with the leave type. */
async function leaveDays(tx: Tx, staffIds: string[], from: Date, to: Date) {
  const leaves = await tx.leaveRequest.findMany({ where: { staffId: { in: staffIds }, status: 'APPROVED', fromDate: { lte: to }, toDate: { gte: from } } });
  const out = new Map<string, Map<string, string>>();
  for (const l of leaves) {
    const m = out.get(l.staffId) ?? new Map<string, string>();
    for (let t = Math.max(l.fromDate.getTime(), from.getTime()); t <= Math.min(l.toDate.getTime(), to.getTime()); t += DAY) m.set(new Date(t).toISOString().slice(0, 10), l.type);
    out.set(l.staffId, m);
  }
  return out;
}

/**
 * Loss-of-pay days in a month: absences not covered by approved paid leave, half days (½), and
 * approved unpaid leave.
 */
export async function lopDays(tx: Tx, staffIds: string[], month: string) {
  const from = toMonthStart(month);
  const to = new Date(from.getTime() + (daysInMonth(month) - 1) * DAY);
  const [rows, leaves] = await Promise.all([tx.staffAttendance.findMany({ where: { staffId: { in: staffIds }, date: { gte: from, lte: to } } }), leaveDays(tx, staffIds, from, to)]);
  const out = new Map<string, number>();
  for (const id of staffIds) {
    const onLeave = leaves.get(id) ?? new Map<string, string>();
    let lop = 0;
    const counted = new Set<string>();
    for (const r of rows.filter((x) => x.staffId === id)) {
      const d = r.date.toISOString().slice(0, 10);
      const leave = onLeave.get(d);
      if (r.status === 'ABSENT' && (!leave || leave === 'UNPAID')) { lop += 1; counted.add(d); }
      if (r.status === 'HALF_DAY' && !leave) lop += 0.5;
    }
    for (const [d, type] of onLeave) if (type === 'UNPAID' && !counted.has(d)) lop += 1;
    out.set(id, lop);
  }
  return out;
}

/** GET /staff-attendance?date=YYYY-MM-DD | ?month=YYYY-MM — the branch's staff register. */
workforceRouter.get('/staff-attendance', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ date: dateOnly.optional(), month: monthParam.optional() }).parse(req.query);
  const branches = hrBranches(ctx, (b) => ctx.access.can('leave.approve', b));
  if (!branches.length) throw forbidden();
  const from = q.date ?? (q.month ? toMonthStart(q.month) : todayUtc());
  const to = q.date ?? (q.month ? new Date(from.getTime() + (daysInMonth(q.month) - 1) * DAY) : todayUtc());
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const staff = await tx.staff.findMany({ where: { branchId: { in: branches }, status: { in: ['ACTIVE', 'ON_LEAVE'] } }, select: { id: true, name: true, employeeCode: true, designation: true, staffType: true }, orderBy: { employeeCode: 'asc' } });
    const ids = staff.map((s) => s.id);
    const [rows, leaves] = await Promise.all([tx.staffAttendance.findMany({ where: { staffId: { in: ids }, date: { gte: from, lte: to } } }), leaveDays(tx, ids, from, to)]);
    return {
      from: toDateString(from), to: toDateString(to),
      staff: staff.map((s) => ({
        ...s,
        days: Object.fromEntries([
          ...[...(leaves.get(s.id) ?? new Map())].map(([d, type]) => [d, { status: 'LEAVE', leaveType: type, marked: false }]),
          ...rows.filter((r) => r.staffId === s.id).map((r) => [toDateString(r.date)!, { status: r.status, inTime: r.inTime, outTime: r.outTime, marked: true }]),
        ]),
      })),
    };
  });
  res.json(out);
});

/** PUT /staff-attendance — marks the register for one day. */
workforceRouter.put('/staff-attendance', async (req, res) => {
  const ctx = ctxOf(req);
  const time = z.string().regex(/^\d{2}:\d{2}$/).nullable().optional();
  const body = z.object({
    date: dateOnly,
    entries: z.array(z.object({ staffId: uuid, status: z.enum(ATT), inTime: time, outTime: time })).min(1).max(500),
  }).parse(req.body);
  if (body.date > todayUtc()) throw badRequest('Attendance cannot be marked for a future date.');
  const saved = await withTenant(ctx.organizationId, async (tx) => {
    const staff = await tx.staff.findMany({ where: { id: { in: body.entries.map((e) => e.staffId) } }, select: { id: true, branchId: true } });
    if (staff.length !== new Set(body.entries.map((e) => e.staffId)).size) throw badRequest('Unknown staff member in the list.');
    for (const s of staff) if (!canMarkAttendance(ctx, s.branchId)) throw forbidden();
    for (const e of body.entries) {
      if (e.inTime && e.outTime && e.outTime < e.inTime) throw badRequest('Out time cannot be before in time.');
      const branchId = staff.find((s) => s.id === e.staffId)!.branchId;
      const data = { status: e.status, inTime: e.inTime ?? null, outTime: e.outTime ?? null, markedById: ctx.userId };
      await tx.staffAttendance.upsert({ where: { staffId_date: { staffId: e.staffId, date: body.date } }, update: data, create: { organizationId: ctx.organizationId, branchId, staffId: e.staffId, date: body.date, ...data } });
    }
    await audit(tx, ctx, { action: 'UPDATE', entity: 'StaffAttendance', entityId: toDateString(body.date)!, after: { entries: body.entries.length } });
    return body.entries.length;
  });
  res.json({ date: toDateString(body.date), saved });
});

/** GET /me/attendance?month= — the signed-in employee's own register. */
workforceRouter.get('/me/attendance', async (req, res) => {
  const ctx = ctxOf(req);
  const month = monthParam.parse(req.query.month ?? new Date().toISOString().slice(0, 7));
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const me = await ownStaff(tx, ctx);
    if (!me) throw forbidden();
    const from = toMonthStart(month);
    const to = new Date(from.getTime() + (daysInMonth(month) - 1) * DAY);
    const rows = await tx.staffAttendance.findMany({ where: { staffId: me.id, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } });
    return { month, lopDays: (await lopDays(tx, [me.id], month)).get(me.id) ?? 0, days: rows.map((r) => ({ date: toDateString(r.date), status: r.status, inTime: r.inTime, outTime: r.outTime })) };
  });
  res.json(out);
});

// ═════════════════════════════════════════════════════════════════════════════
// Leave balances
// ═════════════════════════════════════════════════════════════════════════════

/** Financial year (April–March) containing a date. */
const fyRange = (d = todayUtc()) => {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { from: new Date(Date.UTC(y, 3, 1)), to: new Date(Date.UTC(y + 1, 2, 31)) };
};

/** Leave entitlement, taken and balance per type this financial year. */
export async function leaveBalances(tx: Tx, staffIds: string[], s: HrSettings) {
  const { from, to } = fyRange();
  const leaves = await leaveDays(tx, staffIds, from, to);
  return new Map(staffIds.map((id) => {
    const taken: Record<string, number> = {};
    for (const type of (leaves.get(id) ?? new Map()).values()) taken[type] = (taken[type] ?? 0) + 1;
    const balances = Object.entries(s.leavePolicy).map(([type, entitled]) => ({ type, entitled, taken: taken[type] ?? 0, balance: Math.max(0, entitled - (taken[type] ?? 0)) }));
    return [id, balances];
  }));
}

/** GET /leave-balances — HR / approvers: every employee of their branches; others: their own. */
workforceRouter.get('/leave-balances', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const s = await hrSettings(tx, ctx.organizationId);
    const branches = req.query.mine === '1' ? [] : hrBranches(ctx, (b) => ctx.access.can('leave.approve', b));
    const staff = branches.length
      ? await tx.staff.findMany({ where: { branchId: { in: branches }, status: { not: 'RESIGNED' } }, select: { id: true, name: true, employeeCode: true } })
      : await (async () => { const me = await ownStaff(tx, ctx); if (!me) throw forbidden(); return [{ id: me.id, name: me.name, employeeCode: me.employeeCode }]; })();
    const balances = await leaveBalances(tx, staff.map((x) => x.id), s);
    return staff.map((x) => ({ staffId: x.id, name: x.name, employeeCode: x.employeeCode, balances: balances.get(x.id) ?? [] }));
  });
  res.json(out);
});

// ═════════════════════════════════════════════════════════════════════════════
// Expense claims
// ═════════════════════════════════════════════════════════════════════════════

type ClaimRow = { id: string; staffId: string; claimNo: string; date: Date; category: string; description: string; amount: unknown; receiptName: string | null; status: string; decidedAt: Date | null; remark: string | null; paidMonth: string | null; createdAt: Date };
const claimOut = (c: ClaimRow, names: Map<string, { name: string; employeeCode: string }>) => ({
  id: c.id, staffId: c.staffId, staffName: names.get(c.staffId)?.name ?? '', employeeCode: names.get(c.staffId)?.employeeCode ?? '', claimNo: c.claimNo,
  date: toDateString(c.date), category: c.category, description: c.description, amount: money(c.amount), receiptName: c.receiptName, status: c.status,
  decidedAt: c.decidedAt?.toISOString() ?? null, remark: c.remark, paidMonth: c.paidMonth, createdAt: c.createdAt.toISOString(),
});

/** GET /expense-claims?mine=1 — approvers and payroll see the branch's claims; everyone else (or mine=1) their own. */
workforceRouter.get('/expense-claims', async (req, res) => {
  const ctx = ctxOf(req);
  const mine = req.query.mine === '1';
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const branches = mine ? [] : hrBranches(ctx, (b) => canApprove(ctx, b) || ctx.access.can('payroll.run', b));
    let rows;
    if (branches.length) rows = await tx.expenseClaim.findMany({ where: { branchId: { in: branches } }, orderBy: { createdAt: 'desc' }, take: 1000 });
    else {
      const me = await ownStaff(tx, ctx);
      if (!me) throw forbidden();
      rows = await tx.expenseClaim.findMany({ where: { staffId: me.id }, orderBy: { createdAt: 'desc' } });
    }
    const names = new Map((await tx.staff.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.staffId))] } }, select: { id: true, name: true, employeeCode: true } })).map((s) => [s.id, s]));
    return rows.map((r) => claimOut(r, names));
  });
  res.json(out);
});

/** POST /expense-claims — an employee claims a reimbursement (with the receipt's file name). */
workforceRouter.post('/expense-claims', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    date: dateOnly, category: z.string().trim().min(2).max(40), description: z.string().trim().min(3).max(300),
    amount: z.number().positive().max(500000), receiptName: z.string().trim().max(260).nullable().optional(),
  }).parse(req.body);
  if (body.date > todayUtc()) throw badRequest('The expense date cannot be in the future.');
  if (body.date.getTime() < todayUtc().getTime() - 90 * DAY) throw badRequest('Claims must be made within 90 days of the expense.');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const me = await ownStaff(tx, ctx);
    if (!me) throw forbidden('Only employees can make expense claims.');
    const claimNo = await nextDocNo('CLM', (p) => tx.expenseClaim.count({ where: { claimNo: { startsWith: p } } }));
    const c = await tx.expenseClaim.create({ data: { organizationId: ctx.organizationId, branchId: me.branchId, staffId: me.id, claimNo, date: body.date, category: body.category, description: body.description, amount: body.amount, receiptName: body.receiptName ?? null } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'ExpenseClaim', entityId: c.id, branchId: me.branchId, after: { claimNo, amount: body.amount } });
    return claimOut(c, new Map([[me.id, me]]));
  });
  res.status(201).json(out);
});

/** PATCH /expense-claims/:id — approve or reject (principal / HR); not your own claim. */
workforceRouter.patch('/expense-claims/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ status: z.enum(['APPROVED', 'REJECTED']), remark: z.string().trim().max(300).optional() }).parse(req.body);
  if (body.status === 'REJECTED' && !body.remark) throw badRequest('Give a reason for rejecting.');
  await withTenant(ctx.organizationId, async (tx) => {
    const c = await tx.expenseClaim.findUnique({ where: { id } });
    if (!c) throw notFound('Claim');
    if (!canApprove(ctx, c.branchId)) throw forbidden();
    if ((await ownStaff(tx, ctx))?.id === c.staffId) throw forbidden('You cannot approve your own claim.');
    if (c.status !== 'SUBMITTED') throw conflict(`This claim was already ${c.status.toLowerCase()}.`);
    await tx.expenseClaim.update({ where: { id }, data: { status: body.status, remark: body.remark ?? null, decidedById: ctx.userId, decidedAt: new Date() } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'ExpenseClaim', entityId: id, branchId: c.branchId, before: { status: c.status }, after: body });
  });
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// Payslips & statutory compliance
// ═════════════════════════════════════════════════════════════════════════════

/** GET /payslips/:id — one payslip in full (HR / accounts, or the employee). */
workforceRouter.get('/payslips/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const p = await tx.payslip.findUnique({ where: { id }, include: { payrollRun: true, staff: true } });
    if (!p) throw notFound('Payslip');
    const b = p.payrollRun.branchId;
    if (p.staff.userId !== ctx.userId && !ctx.access.can('payroll.run', b) && !canManageHr(ctx, b) && !ctx.access.can('reports.view', b)) throw notFound('Payslip');
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: b }, select: { name: true, address: true, city: true } });
    const bank = p.staff.bankAccount ? '(on file)' : null;
    return {
      id: p.id, month: p.payrollRun.month, status: p.payrollRun.status, paidAt: toDateString(p.payrollRun.paidAt),
      school: branch, bank,
      staff: { id: p.staff.id, name: p.staff.name, employeeCode: p.staff.employeeCode, designation: p.staff.designation, department: p.staff.department, joiningDate: toDateString(p.staff.joiningDate) },
      gross: money(p.gross), deductions: money(p.deductions), net: money(p.net), breakdown: parseJson(p.breakdown),
    };
  });
  res.json(out);
});

/** GET /me/payslips — the signed-in employee's payslips. */
workforceRouter.get('/me/payslips', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const me = await ownStaff(tx, ctx);
    if (!me) throw forbidden();
    const slips = await tx.payslip.findMany({ where: { staffId: me.id }, include: { payrollRun: { select: { month: true, status: true, paidAt: true } } } });
    return slips
      .map((p) => ({ id: p.id, month: p.payrollRun.month, status: p.payrollRun.status, paidAt: toDateString(p.payrollRun.paidAt), gross: money(p.gross), deductions: money(p.deductions), net: money(p.net) }))
      .sort((a, b) => b.month.localeCompare(a.month));
  });
  res.json(out);
});

/** GET /payroll/:month/compliance — PF, ESI, professional tax and TDS for a processed month. */
workforceRouter.get('/payroll/:month/compliance', async (req, res) => {
  const ctx = ctxOf(req);
  const month = monthParam.parse(req.params.month);
  const branches = hrBranches(ctx, (b) => ctx.access.can('payroll.run', b) || ctx.access.can('reports.view', b));
  if (!branches.length) throw forbidden();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const runs = await tx.payrollRun.findMany({ where: { branchId: { in: branches }, month }, include: { payslips: { include: { staff: { select: { name: true, employeeCode: true } } } } } });
    if (!runs.length) throw notFound('Payroll for this month');
    const rows = runs.flatMap((r) => r.payslips).map((p) => {
      const b = (parseJson(p.breakdown) ?? {}) as { earnings?: { basic?: number; da?: number }; deductionsDetail?: Record<string, number>; employer?: Record<string, number>; gross?: number };
      const d = b.deductionsDetail ?? {};
      const e = b.employer ?? {};
      return {
        employeeCode: p.staff.employeeCode, name: p.staff.name, gross: money(p.gross), pfWage: Math.min((b.earnings?.basic ?? 0) + (b.earnings?.da ?? 0), 15000),
        pfEmployee: d.pf ?? 0, pfEmployer: e.pf ?? 0, esiEmployee: d.esi ?? 0, esiEmployer: e.esi ?? 0, pt: d.pt ?? 0, tds: d.tds ?? 0,
      };
    });
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((t, r) => t + Number(r[k] || 0), 0);
    return {
      month, employees: rows.length, rows,
      totals: {
        pfEmployee: sum('pfEmployee'), pfEmployer: sum('pfEmployer'), pfTotal: sum('pfEmployee') + sum('pfEmployer'),
        esiEmployee: sum('esiEmployee'), esiEmployer: sum('esiEmployer'), esiTotal: sum('esiEmployee') + sum('esiEmployer'),
        pt: sum('pt'), tds: sum('tds'),
      },
      due: { pf: `15 ${nextMonthName(month)}`, esi: `15 ${nextMonthName(month)}`, tds: `7 ${nextMonthName(month)}` },
    };
  });
  res.json(out);
});

function nextMonthName(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
