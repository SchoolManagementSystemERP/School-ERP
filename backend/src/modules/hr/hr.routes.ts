import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { targetBranch } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';

/**
 * Leave and payroll.
 *  - Any staff member applies for their own leave; HR (staff.write) can file it for someone else.
 *    Principal / HR (leave.approve) decide, never on their own request.
 *  - Payroll is processed per branch and month from the staff salary structure:
 *      gross = basic + HRA + DA + TA + other allowances
 *      deductions = PF 12 % (of basic; for staff paid a consolidated salary, of half of it) + professional tax ₹200
 */
export const hrRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const money = (d: unknown) => Math.round(Number(d ?? 0) * 100) / 100;
const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'UNPAID'] as const;
const PROFESSIONAL_TAX = 200;

const ownStaff = (tx: Tx, ctx: RequestContext) => tx.staff.findFirst({ where: { userId: ctx.userId }, select: { id: true, branchId: true } });

/** Branches where the user manages people (approves leave or reads staff records). */
const managedBranches = (ctx: RequestContext) => {
  const ok = (b: string) => ctx.access.can('leave.approve', b) || ctx.access.can('staff.read', b);
  return ctx.activeBranchId ? (ok(ctx.activeBranchId) ? [ctx.activeBranchId] : []) : ctx.access.branchesWith().filter(ok);
};

type LeaveRow = { id: string; staffId: string; type: string; fromDate: Date; toDate: Date; reason: string; status: string; decidedAt: Date | null; createdAt: Date; staff: { name: string; employeeCode: string; staffType: string } };
const leaveOut = (l: LeaveRow) => ({
  id: l.id, staffId: l.staffId, staffName: l.staff.name, employeeCode: l.staff.employeeCode, staffType: l.staff.staffType, type: l.type,
  fromDate: toDateString(l.fromDate), toDate: toDateString(l.toDate), reason: l.reason, status: l.status, decidedAt: toDateString(l.decidedAt), createdAt: toDateString(l.createdAt),
});
const leaveInclude = { staff: { select: { name: true, employeeCode: true, staffType: true } } } as const;

// ═════════════════════════════════════════════════════════════════════════════
// Leave
// ═════════════════════════════════════════════════════════════════════════════

/** GET /leaves — managers: everyone in their branches; others: their own requests. */
hrRouter.get('/leaves', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const branches = managedBranches(ctx);
    if (branches.length) return (await tx.leaveRequest.findMany({ where: { branchId: { in: branches } }, include: leaveInclude, orderBy: { createdAt: 'desc' } })).map(leaveOut);
    const me = await ownStaff(tx, ctx);
    if (!me) throw forbidden();
    return (await tx.leaveRequest.findMany({ where: { staffId: me.id }, include: leaveInclude, orderBy: { createdAt: 'desc' } })).map(leaveOut);
  });
  res.json(out);
});

/** POST /leaves — apply (for yourself, or for a colleague with staff.write). */
hrRouter.post('/leaves', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    staffId: uuid.optional(), type: z.string().toUpperCase().pipe(z.enum(LEAVE_TYPES)),
    fromDate: dateOnly, toDate: dateOnly, reason: z.string().trim().min(1, 'Please give a reason').max(500),
  }).parse(req.body);
  if (body.toDate < body.fromDate) throw badRequest('End date must be on or after the start date.');
  if (body.toDate.getTime() - body.fromDate.getTime() > 180 * 86_400_000) throw badRequest('A leave request cannot be longer than 180 days.');

  const out = await withTenant(ctx.organizationId, async (tx) => {
    const me = await ownStaff(tx, ctx);
    const staffId = body.staffId ?? me?.id;
    if (!staffId) throw badRequest('Choose the staff member this leave is for.');
    const staff = await tx.staff.findUnique({ where: { id: staffId }, select: { id: true, branchId: true, status: true } });
    if (!staff) throw notFound('Staff member');
    if (staff.id !== me?.id && !ctx.access.can('staff.write', staff.branchId)) throw forbidden();
    if (staff.status === 'RESIGNED') throw badRequest('This staff member has left.');
    const overlap = await tx.leaveRequest.count({ where: { staffId, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: body.toDate }, toDate: { gte: body.fromDate } } });
    if (overlap) throw conflict('There is already a leave request for some of these days.');
    const l = await tx.leaveRequest.create({ data: { organizationId: ctx.organizationId, branchId: staff.branchId, staffId, type: body.type, fromDate: body.fromDate, toDate: body.toDate, reason: body.reason }, include: leaveInclude });
    await audit(tx, ctx, { action: 'CREATE', entity: 'LeaveRequest', entityId: l.id, branchId: staff.branchId, after: { type: body.type, from: toDateString(body.fromDate), to: toDateString(body.toDate) } });
    return leaveOut(l);
  });
  res.status(201).json(out);
});

/** PATCH /leaves/:id — approve or reject a pending request. Needs leave.approve; not for your own request. */
hrRouter.patch('/leaves/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const l = await tx.leaveRequest.findUnique({ where: { id } });
    if (!l) throw notFound('Leave request');
    if (!ctx.access.can('leave.approve', l.branchId)) throw forbidden();
    if ((await ownStaff(tx, ctx))?.id === l.staffId) throw forbidden('You cannot decide your own leave.');
    if (l.status !== 'PENDING') throw conflict(`This request was already ${l.status.toLowerCase()}.`);
    const updated = await tx.leaveRequest.update({ where: { id }, data: { status: body.status, decidedById: ctx.userId, decidedAt: new Date() }, include: leaveInclude });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'LeaveRequest', entityId: id, branchId: l.branchId, before: { status: l.status }, after: body });
    return leaveOut(updated);
  });
  res.json(out);
});

// ═════════════════════════════════════════════════════════════════════════════
// Payroll
// ═════════════════════════════════════════════════════════════════════════════

const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

/** Branches whose payroll the user may see: where they run payroll or view reports. */
function payrollBranches(ctx: RequestContext) {
  const ok = (b: string) => ctx.access.can('payroll.run', b) || ctx.access.can('reports.view', b);
  const ids = ctx.activeBranchId ? (ok(ctx.activeBranchId) ? [ctx.activeBranchId] : []) : ctx.access.branchesWith().filter(ok);
  if (!ids.length) throw forbidden();
  return ids;
}

type StaffPay = { id: string; staffType: string; basicSalary: unknown; allowances: string | null; employeeCode: string; name: string; designation: string };
function payslipFor(s: StaffPay) {
  const a = (parseJson(s.allowances) ?? {}) as Record<string, number | null>;
  const basic = money(s.basicSalary);
  const allowances = { hra: money(a.hra), da: money(a.da), ta: money(a.ta), other: money(a.other) };
  const gross = basic + allowances.hra + allowances.da + allowances.ta + allowances.other;
  const consolidated = gross === basic && s.staffType === 'NON_TEACHING';
  const pf = Math.round((consolidated ? basic * 0.5 : basic) * 0.12);
  const deductions = gross > 0 ? pf + PROFESSIONAL_TAX : 0;
  return { gross, deductions, net: gross - deductions, breakdown: { basic, ...allowances, pf, professionalTax: gross > 0 ? PROFESSIONAL_TAX : 0, employeeCode: s.employeeCode, name: s.name, designation: s.designation, staffType: s.staffType } };
}

/** GET /payroll — payroll runs with their payslips. */
hrRouter.get('/payroll', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = payrollBranches(ctx);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const runs = await tx.payrollRun.findMany({
      where: { branchId: { in: branchIds } },
      include: { payslips: { include: { staff: { select: { employeeCode: true, name: true, designation: true, staffType: true } } } } },
      orderBy: { month: 'asc' },
    });
    return runs.map((r) => ({
      id: r.id, branchId: r.branchId, month: r.month, status: r.status, processedAt: toDateString(r.processedAt), paidAt: toDateString(r.paidAt),
      payslips: r.payslips.map((p) => ({ staffId: p.staffId, employeeCode: p.staff.employeeCode, name: p.staff.name, designation: p.staff.designation, staffType: p.staff.staffType, gross: money(p.gross), deductions: money(p.deductions), net: money(p.net) })),
    }));
  });
  res.json(out);
});

/** POST /payroll/:month/process — (re)computes a month's payslips for the branch. Needs payroll.run; a paid month is final. */
hrRouter.post('/payroll/:month/process', async (req, res) => {
  const ctx = ctxOf(req);
  const month = monthParam.parse(req.params.month);
  const branchId = targetBranch(ctx, 'payroll.run', z.object({ branchId: uuid.optional() }).parse(req.body ?? {}).branchId);
  const now = new Date();
  if (month > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`) throw badRequest('Payroll cannot be processed for a future month.');
  const [y, m] = month.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0));

  const out = await withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.payrollRun.findUnique({ where: { branchId_month: { branchId, month } } });
    if (existing?.status === 'PAID') throw conflict('This month has already been paid — it cannot be processed again.');
    const staff = await tx.staff.findMany({
      where: { branchId, status: { in: ['ACTIVE', 'ON_LEAVE'] }, OR: [{ joiningDate: null }, { joiningDate: { lte: monthEnd } }] },
      select: { id: true, staffType: true, basicSalary: true, allowances: true, employeeCode: true, name: true, designation: true },
    });
    const run = existing
      ? await tx.payrollRun.update({ where: { id: existing.id }, data: { processedAt: new Date(), status: 'PROCESSED' } })
      : await tx.payrollRun.create({ data: { organizationId: ctx.organizationId, branchId, month, status: 'PROCESSED', processedAt: new Date() } });
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    const slips = staff.map((s) => ({ staffId: s.id, ...payslipFor(s) })).filter((s) => s.gross > 0);
    if (slips.length) await tx.payslip.createMany({ data: slips.map((s) => ({ organizationId: ctx.organizationId, payrollRunId: run.id, staffId: s.staffId, gross: s.gross, deductions: s.deductions, net: s.net, breakdown: JSON.stringify(s.breakdown) })) });
    const totals = slips.reduce((t, s) => ({ gross: t.gross + s.gross, net: t.net + s.net }), { gross: 0, net: 0 });
    await audit(tx, ctx, { action: existing ? 'UPDATE' : 'CREATE', entity: 'PayrollRun', entityId: run.id, branchId, after: { month, payslips: slips.length, ...totals } });
    return { id: run.id, month, status: 'PROCESSED', payslips: slips.length, ...totals };
  });
  res.json(out);
});

/** POST /payroll/:month/pay — marks a processed month as paid. Needs payroll.run. */
hrRouter.post('/payroll/:month/pay', async (req, res) => {
  const ctx = ctxOf(req);
  const month = monthParam.parse(req.params.month);
  const branchId = targetBranch(ctx, 'payroll.run', z.object({ branchId: uuid.optional() }).parse(req.body ?? {}).branchId);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { branchId_month: { branchId, month } } });
    if (!run) throw notFound('Payroll for this month');
    if (run.status === 'PAID') throw conflict('This month is already paid.');
    const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PAID', paidAt: new Date() } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'PayrollRun', entityId: run.id, branchId, before: { status: run.status }, after: { status: 'PAID' } });
    return { id: updated.id, month, status: updated.status, paidAt: toDateString(updated.paidAt) };
  });
  res.json(out);
});
