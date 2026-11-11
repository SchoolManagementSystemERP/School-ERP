import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { targetBranch } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { decryptJson } from '../../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, toDateString } from '../../lib/http.js';
import { componentsOf, grossOf, hrSettings, monthlyPayslip } from '../../lib/payroll.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { paymentLedgerLine, postJournal } from '../finance/ledger.js';
import { lopDays } from '../hrms/workforce.routes.js';

/**
 * Leave and payroll.
 *  - Any staff member applies for their own leave; HR (staff.write) can file it for someone else.
 *    Principal / HR (leave.approve) decide, never on their own request.
 *  - Payroll is processed per branch and month from each employee's salary structure (src/lib/payroll.ts):
 *      earnings are reduced for loss-of-pay days (unapproved absences, unpaid leave) and approved expense
 *      claims are reimbursed; deductions are employee PF, ESI, professional tax and TDS.
 */
export const hrRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const money = (d: unknown) => Math.round(Number(d ?? 0) * 100) / 100;
const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'UNPAID'] as const;

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

hrRouter.get('/payroll/advances', async (req, res) => {
  const ctx = ctxOf(req);
  const branches = payrollBranches(ctx);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const advances = await tx.staffAdvance.findMany({
      where: { branchId: { in: branches } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const staff = await tx.staff.findMany({
      where: { id: { in: advances.map((advance) => advance.staffId) } },
      select: { id: true, name: true, employeeCode: true },
    });
    const staffById = new Map(staff.map((person) => [person.id, person]));
    return advances.map((advance) => {
      const person = staffById.get(advance.staffId);
      if (!person) throw new Error('A salary advance references a missing staff record.');
      return { advance, staff: person };
    });
  });
  res.json(rows.map(({ advance, staff }) => ({
    id: advance.id, staffId: advance.staffId, employeeCode: staff.employeeCode, staffName: staff.name,
    branchId: advance.branchId, principalAmount: money(advance.principalAmount),
    outstandingAmount: money(advance.outstandingAmount), installmentAmount: money(advance.installmentAmount),
    startMonth: advance.startMonth, purpose: advance.purpose, disbursedMethod: advance.disbursedMethod,
    reference: advance.reference, disbursedAt: toDateString(advance.disbursedAt), status: advance.status,
  })));
});

hrRouter.post('/payroll/advances', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    branchId: uuid.optional(), staffId: uuid,
    principalAmount: z.number().positive().max(100_000_000).refine((value) => Number(value.toFixed(2)) === value),
    installmentAmount: z.number().positive().max(100_000_000).refine((value) => Number(value.toFixed(2)) === value),
    startMonth: monthParam,
    purpose: z.string().trim().min(3).max(300),
    disbursedMethod: z.enum(['BANK_TRANSFER', 'CASH']),
    reference: z.string().trim().max(100).optional(),
  }).parse(req.body);
  if (body.installmentAmount > body.principalAmount) throw badRequest('The monthly installment cannot exceed the advance amount.');
  const branchId = targetBranch(ctx, 'payroll.run', body.branchId);
  const row = await withTenant(ctx.organizationId, async (tx) => {
    const staff = await tx.staff.findFirst({
      where: { id: body.staffId, branchId, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      select: { id: true, name: true, employeeCode: true, basicSalary: true, allowances: true, compensation: true },
    });
    if (!staff) throw notFound('Active staff member in this branch');
    if (grossOf(componentsOf(staff)) <= 0) throw badRequest('Salary advances are only available for staff with a payroll salary structure.');
    const advance = await tx.staffAdvance.create({
      data: {
        id: randomUUID(), organizationId: ctx.organizationId, branchId, staffId: staff.id,
        principalAmount: body.principalAmount, outstandingAmount: body.principalAmount,
        installmentAmount: body.installmentAmount, startMonth: body.startMonth,
        purpose: body.purpose, disbursedMethod: body.disbursedMethod,
        reference: body.reference || null, disbursedAt: new Date(),
        status: 'ACTIVE', createdById: ctx.userId,
      },
    });
    const paymentAccount = await paymentLedgerLine(tx, branchId, body.disbursedMethod);
    await postJournal(tx, ctx, {
      branchId, date: advance.disbursedAt, description: `Salary advance · ${staff.employeeCode}`,
      sourceType: 'STAFF_ADVANCE', sourceId: advance.id,
      lines: [
        { accountCode: '1110', description: `${staff.employeeCode} · ${body.purpose}`, debit: body.principalAmount },
        { ...paymentAccount, description: `Advance paid by ${body.disbursedMethod}`, credit: body.principalAmount },
      ],
    });
    await audit(tx, ctx, {
      action: 'CREATE', entity: 'StaffAdvance', entityId: advance.id, branchId,
      after: { staffId: staff.id, employeeCode: staff.employeeCode, startMonth: body.startMonth, status: advance.status },
    });
    return advance;
  });
  res.status(201).json({
    id: row.id, staffId: row.staffId, principalAmount: money(row.principalAmount),
    outstandingAmount: money(row.outstandingAmount), installmentAmount: money(row.installmentAmount),
    startMonth: row.startMonth, purpose: row.purpose, status: row.status,
  });
});

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
      payslips: r.payslips.map((p) => ({ id: p.id, staffId: p.staffId, employeeCode: p.staff.employeeCode, name: p.staff.name, designation: p.staff.designation, staffType: p.staff.staffType, gross: money(p.gross), deductions: money(p.deductions), net: money(p.net) })),
    }));
  });
  res.json(out);
});

hrRouter.get('/payroll/:month/bank-transfer', async (req, res) => {
  const ctx = ctxOf(req);
  const month = monthParam.parse(req.params.month);
  const branchId = targetBranch(ctx, 'payroll.run', ctx.activeBranchId ?? undefined);
  if (!ctx.access.can('staff.write', branchId)) throw forbidden('Bank transfer exports require permission to view staff banking details.');
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { branchId_month: { branchId, month } },
      include: { payslips: { include: { staff: { select: { employeeCode: true, name: true, bankAccount: true } } } } },
    });
    if (!run) throw notFound('Payroll for this month');
    const payees = run.payslips.filter((slip) => money(slip.net) > 0).map((slip) => {
      const bank = decryptJson<{ accountNo?: unknown; ifsc?: unknown; bankName?: unknown }>(slip.staff.bankAccount);
      const accountNo = typeof bank?.accountNo === 'string' ? bank.accountNo.trim() : '';
      const ifsc = typeof bank?.ifsc === 'string' ? bank.ifsc.trim().toUpperCase() : '';
      if (!accountNo || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        return { employeeCode: slip.staff.employeeCode, name: slip.staff.name, accountNo: '', ifsc: '', amount: money(slip.net) };
      }
      return { employeeCode: slip.staff.employeeCode, name: slip.staff.name, accountNo, ifsc, amount: money(slip.net) };
    });
    const missing = payees.filter((payee) => !payee.accountNo || !payee.ifsc);
    if (missing.length) {
      throw badRequest(`Add valid account number and IFSC for: ${missing.map((person) => person.employeeCode).join(', ')}.`);
    }
    await audit(tx, ctx, {
      action: 'EXPORT', entity: 'PayrollBankTransfer', branchId,
      after: { month, payees: payees.length, total: money(payees.reduce((sum, payee) => sum + payee.amount, 0)) },
    });
    return payees;
  });
  res.json(rows);
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
      select: { id: true, staffType: true, basicSalary: true, allowances: true, compensation: true, employeeCode: true, name: true, designation: true },
    });
    const settings = await hrSettings(tx, ctx.organizationId);
    const lop = await lopDays(tx, staff.map((x) => x.id), month);
    // approved claims not yet paid (or attached to this month by an earlier run) are reimbursed with this salary
    const claims = await tx.expenseClaim.findMany({ where: { staffId: { in: staff.map((x) => x.id) }, status: 'APPROVED', OR: [{ paidMonth: null }, { paidMonth: month }] } });
    const advances = await tx.staffAdvance.findMany({
      where: { branchId, staffId: { in: staff.map((person) => person.id) }, status: 'ACTIVE', startMonth: { lte: month } },
      orderBy: { createdAt: 'asc' },
    });
    const run = existing
      ? await tx.payrollRun.update({ where: { id: existing.id }, data: { processedAt: new Date(), status: 'PROCESSED' } })
      : await tx.payrollRun.create({ data: { organizationId: ctx.organizationId, branchId, month, status: 'PROCESSED', processedAt: new Date() } });
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    const slips = staff
      .map((s) => {
        const reimbursement = claims.filter((c) => c.staffId === s.id).reduce((t, c) => t + Number(c.amount), 0);
        const p = monthlyPayslip(componentsOf(s), settings, { daysInMonth: monthEnd.getUTCDate(), lopDays: lop.get(s.id) ?? 0, reimbursement });
        let advanceCapacity = Math.max(0, p.net);
        const advanceRepayments = advances.filter((advance) => advance.staffId === s.id).flatMap((advance) => {
          const deduction = money(Math.min(money(advance.outstandingAmount), money(advance.installmentAmount), advanceCapacity));
          advanceCapacity = money(advanceCapacity - deduction);
          return deduction > 0 ? [{ id: advance.id, amount: deduction }] : [];
        });
        const advanceDeduction = advanceRepayments.reduce((sum, repayment) => sum + repayment.amount, 0);
        return {
          staffId: s.id, gross: p.gross, deductions: money(p.deductions + advanceDeduction),
          net: money(p.net - advanceDeduction),
          breakdown: {
            ...p, deductionsDetail: { ...p.deductionsDetail, salaryAdvance: advanceDeduction },
            advanceRepayments, employeeCode: s.employeeCode, name: s.name,
            designation: s.designation, staffType: s.staffType,
          },
        };
      })
      .filter((s) => s.gross > 0);
    const assignedClaims = await tx.expenseClaim.updateMany({ where: { id: { in: claims.map((c) => c.id) } }, data: { paidMonth: month } });
    if (assignedClaims.count) {
      await audit(tx, ctx, {
        action: 'UPDATE', entity: 'ExpenseClaim', branchId,
        after: { count: assignedClaims.count, paidMonth: month, status: 'APPROVED' },
      });
    }
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
    await tx.$queryRaw`SELECT [id] FROM dbo.[PayrollRun] WITH (UPDLOCK, HOLDLOCK) WHERE [branchId] = ${branchId} AND [month] = ${month}`;
    const run = await tx.payrollRun.findUnique({ where: { branchId_month: { branchId, month } } });
    if (!run) throw notFound('Payroll for this month');
    if (run.status === 'PAID') throw conflict('This month is already paid.');
    const slips = await tx.payslip.findMany({ where: { payrollRunId: run.id } });
    const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PAID', paidAt: new Date() } });
    const gross = slips.reduce((sum, slip) => sum + money(slip.gross), 0);
    const deductions = slips.reduce((sum, slip) => sum + money(slip.deductions), 0);
    const net = slips.reduce((sum, slip) => sum + money(slip.net), 0);
    const repayments: { advanceId: string; staffId: string; amount: number }[] = [];
    for (const slip of slips) {
      const parsed = z.object({
        advanceRepayments: z.array(z.object({ id: uuid, amount: z.number().positive() })).default([]),
      }).passthrough().safeParse(JSON.parse(slip.breakdown));
      if (!parsed.success) throw new Error(`Payslip ${slip.id} has invalid stored salary-advance details.`);
      for (const repayment of parsed.data.advanceRepayments) {
        repayments.push({ advanceId: repayment.id, staffId: slip.staffId, amount: repayment.amount });
      }
    }
    const advanceDeduction = money(repayments.reduce((sum, repayment) => sum + repayment.amount, 0));
    const statutoryDeductions = money(deductions - advanceDeduction);
    if (gross > 0) {
      const bankAccount = await paymentLedgerLine(tx, branchId, 'BANK_TRANSFER');
      await postJournal(tx, ctx, {
        branchId, date: updated.paidAt!, description: `Payroll disbursement · ${month}`,
        sourceType: 'PAYROLL_RUN', sourceId: run.id,
        lines: [
          { accountCode: '5000', description: `Gross payroll ${month}`, debit: gross },
          { ...bankAccount, description: `Net salaries paid ${month}`, credit: net },
          ...(statutoryDeductions > 0 ? [{ accountCode: '2100', description: `Statutory payroll deductions ${month}`, credit: statutoryDeductions }] : []),
          ...(advanceDeduction > 0 ? [{ accountCode: '1110', description: `Staff salary advance recovery ${month}`, credit: advanceDeduction }] : []),
        ],
      });
    }
    for (const repayment of repayments) {
      await tx.$queryRaw`SELECT [id] FROM dbo.[StaffAdvance] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${repayment.advanceId}`;
      const advance = await tx.staffAdvance.findUnique({ where: { id: repayment.advanceId } });
      if (!advance || advance.staffId !== repayment.staffId || advance.branchId !== branchId || advance.status !== 'ACTIVE'
        || money(advance.outstandingAmount) < repayment.amount) {
        throw conflict('A salary advance balance changed after payroll was processed. Re-process payroll before marking it paid.');
      }
      const outstandingAmount = money(money(advance.outstandingAmount) - repayment.amount);
      const updatedAdvance = await tx.staffAdvance.update({
        where: { id: advance.id },
        data: { outstandingAmount, status: outstandingAmount === 0 ? 'PAID' : 'ACTIVE' },
      });
      await audit(tx, ctx, {
        action: 'UPDATE', entity: 'StaffAdvance', entityId: updatedAdvance.id, branchId,
        before: { outstandingAmount: money(advance.outstandingAmount), status: advance.status },
        after: { outstandingAmount, status: updatedAdvance.status, payrollMonth: month, repayment: repayment.amount },
      });
    }
    const paidClaims = await tx.expenseClaim.updateMany({ where: { branchId, status: 'APPROVED', paidMonth: month }, data: { status: 'PAID' } });
    if (paidClaims.count) {
      await audit(tx, ctx, {
        action: 'UPDATE', entity: 'ExpenseClaim', branchId,
        after: { count: paidClaims.count, paidMonth: month, status: 'PAID' },
      });
    }
    await audit(tx, ctx, { action: 'UPDATE', entity: 'PayrollRun', entityId: run.id, branchId, before: { status: run.status }, after: { status: 'PAID' } });
    return { id: updated.id, month, status: updated.status, paidAt: toDateString(updated.paidAt) };
  });
  res.json(out);
});
