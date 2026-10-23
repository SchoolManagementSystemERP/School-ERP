import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { env } from '../../config/env.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { audit } from '../../lib/audit.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, toDateString } from '../../lib/http.js';
import { memberBranches, readScope } from '../../lib/scope.js';
import { ctxOf } from '../../middleware/authenticate.js';

/**
 * Fees (structure, student accounts, payments) and expenses.
 *
 * A student's fee for the year = the TUITION plan of their grade, less their concessions (capped at
 * 100 %), split into the plan's installments by percentage (the last one takes the rounding).
 * Late fee = days past the due date × the organization's `lateFeePerDay` setting.
 */
export const financeRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const money = (d: unknown) => Math.round(Number(d ?? 0) * 100) / 100;
const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

async function lateFeePerDay(tx: Tx, organizationId: string): Promise<number> {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  try {
    const v = Number(JSON.parse(org.settings ?? '{}').lateFeePerDay);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** Splits a total by percentages; the last share takes the rounding difference. */
function split(total: number, percents: number[]) {
  const out = percents.map((p) => Math.round((total * p) / 100));
  if (out.length) out[out.length - 1] = total - out.slice(0, -1).reduce((a, b) => a + b, 0);
  return out;
}

type Account = {
  studentId: string; branchId: string; gradeId: string | null; annualFee: number; concessionPercent: number; total: number;
  installments: { id: string; no: number; name: string; dueDate: string; amount: number }[];
};

/** Fee accounts (this academic year) for the given students. */
async function feeAccounts(tx: Tx, studentIds: string[], yearId: string): Promise<Account[]> {
  if (!studentIds.length) return [];
  const [students, enrollments, concessions] = await Promise.all([
    tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, branchId: true } }),
    tx.enrollment.findMany({ where: { academicYearId: yearId, studentId: { in: studentIds } }, select: { studentId: true, section: { select: { gradeId: true } } } }),
    tx.feeConcession.findMany({ where: { academicYearId: yearId, studentId: { in: studentIds } }, select: { studentId: true, percent: true } }),
  ]);
  const gradeOf = new Map(enrollments.map((e) => [e.studentId, e.section.gradeId]));
  const plans = await tx.feePlan.findMany({
    where: { academicYearId: yearId, feeHead: 'TUITION', gradeId: { in: [...new Set(gradeOf.values())] } },
    include: { installments: { orderBy: { installmentNo: 'asc' } } },
  });
  const planOf = new Map(plans.map((p) => [p.gradeId, p]));
  const concessionOf = new Map<string, number>();
  for (const c of concessions) concessionOf.set(c.studentId, (concessionOf.get(c.studentId) ?? 0) + Number(c.percent));

  return students.map((s) => {
    const gradeId = gradeOf.get(s.id) ?? null;
    const plan = gradeId ? planOf.get(gradeId) : undefined;
    const annualFee = money(plan?.annualAmount ?? 0);
    const concessionPercent = Math.min(100, concessionOf.get(s.id) ?? 0);
    const total = Math.round((annualFee * (100 - concessionPercent)) / 100);
    const amounts = split(total, plan?.installments.map((i) => Number(i.percent)) ?? []);
    return {
      studentId: s.id, branchId: s.branchId, gradeId, annualFee, concessionPercent, total,
      installments: (plan?.installments ?? []).map((i, k) => ({ id: i.id, no: i.installmentNo, name: i.name, dueDate: toDateString(i.dueDate)!, amount: amounts[k] })),
    };
  });
}

/** Students covered by a fee read: staff with fees.read in their branches, or the caller's own children. */
async function feeStudents(tx: Tx, ctx: RequestContext, yearId: string) {
  const scope = await readScope(tx, ctx, 'fees.read', yearId);
  if (scope.kind === 'self') return scope.studentIds;
  return (await tx.student.findMany({ where: { branchId: { in: scope.branchIds }, status: 'ACTIVE' }, select: { id: true } })).map((s) => s.id);
}

const paymentOut = (p: { id: string; studentId: string; installmentId: string; amount: unknown; lateFee: unknown; method: string; status: string; receiptNo: string; gatewayRef: string | null; paidAt: Date }, installmentNo: Map<string, number>) => ({
  id: p.id, studentId: p.studentId, installmentNo: installmentNo.get(p.installmentId) ?? 0, amount: money(p.amount), lateFee: money(p.lateFee),
  method: p.method, status: p.status, receiptNo: p.receiptNo, gatewayRef: p.gatewayRef, paidAt: toDateString(p.paidAt),
});

// ═════════════════════════════════════════════════════════════════════════════
// Fee structure
// ═════════════════════════════════════════════════════════════════════════════

/** GET /fees/structure — tuition per grade with its installments (anyone in the branch may see it). */
financeRouter.get('/fees/structure', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = memberBranches(ctx);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const grades = await tx.grade.findMany({ where: { branchId: { in: branchIds } }, select: { id: true, name: true, sortOrder: true, branchId: true }, orderBy: { sortOrder: 'asc' } });
    const plans = await tx.feePlan.findMany({ where: { academicYearId: year.id, feeHead: 'TUITION', gradeId: { in: grades.map((g) => g.id) } }, include: { installments: { orderBy: { installmentNo: 'asc' } } } });
    const planOf = new Map(plans.map((p) => [p.gradeId, p]));
    return {
      lateFeePerDay: await lateFeePerDay(tx, ctx.organizationId),
      grades: grades.map((g) => {
        const p = planOf.get(g.id);
        return {
          gradeId: g.id, grade: g.name, sortOrder: g.sortOrder, branchId: g.branchId, annualAmount: p ? money(p.annualAmount) : null,
          installments: (p?.installments ?? []).map((i) => ({ no: i.installmentNo, name: i.name, dueDate: toDateString(i.dueDate), percent: Number(i.percent) })),
        };
      }),
    };
  });
  res.json(out);
});

/**
 * PUT /fees/structure/:gradeId — sets a grade's annual tuition. Needs fees.structure.
 * A new plan copies the installment schedule of the branch's other plans (or one installment at the start of the year).
 */
financeRouter.put('/fees/structure/:gradeId', async (req, res) => {
  const ctx = ctxOf(req);
  const gradeId = idParam(req, 'gradeId');
  const body = z.object({ annualAmount: z.number().min(0).max(10_000_000) }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const grade = await tx.grade.findUnique({ where: { id: gradeId }, select: { id: true, branchId: true, name: true } });
    if (!grade) throw notFound('Class');
    if (!ctx.access.can('fees.structure', grade.branchId)) throw forbidden();
    const year = await currentYear(tx);
    const existing = await tx.feePlan.findFirst({ where: { academicYearId: year.id, gradeId, feeHead: 'TUITION' } });
    let planId: string;
    if (existing) {
      await tx.feePlan.update({ where: { id: existing.id }, data: { annualAmount: body.annualAmount } });
      planId = existing.id;
    } else {
      const template = await tx.feePlan.findFirst({ where: { academicYearId: year.id, branchId: grade.branchId, feeHead: 'TUITION' }, include: { installments: true } });
      const schedule = template?.installments.length
        ? template.installments.map((i) => ({ installmentNo: i.installmentNo, name: i.name, dueDate: i.dueDate, percent: i.percent }))
        : [{ installmentNo: 1, name: 'Annual Fee', dueDate: year.startDate, percent: 100 }];
      const plan = await tx.feePlan.create({
        data: {
          organizationId: ctx.organizationId, branchId: grade.branchId, academicYearId: year.id, gradeId, feeHead: 'TUITION', annualAmount: body.annualAmount,
          installments: { create: schedule.map((i) => ({ organizationId: ctx.organizationId, ...i })) },
        },
      });
      planId = plan.id;
    }
    await audit(tx, ctx, { action: existing ? 'UPDATE' : 'CREATE', entity: 'FeePlan', entityId: planId, branchId: grade.branchId, before: existing ? { annualAmount: money(existing.annualAmount) } : undefined, after: { grade: grade.name, ...body } });
    return { gradeId, annualAmount: body.annualAmount };
  });
  res.json(out);
});

// ═════════════════════════════════════════════════════════════════════════════
// Accounts & payments
// ═════════════════════════════════════════════════════════════════════════════

/** GET /fees/accounts — each student's fee for the year and installment amounts (staff: the branch; parents: their children). */
financeRouter.get('/fees/accounts', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    return feeAccounts(tx, await feeStudents(tx, ctx, year.id), year.id);
  });
  res.json(out);
});

/** GET /fees/payments — successful payments this year (staff: the branch; parents: their children). */
financeRouter.get('/fees/payments', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const studentIds = await feeStudents(tx, ctx, year.id);
    const installments = await tx.feeInstallment.findMany({ where: { feePlan: { academicYearId: year.id } }, select: { id: true, installmentNo: true } });
    const payments = await tx.feePayment.findMany({
      where: { studentId: { in: studentIds }, status: 'SUCCESS', installmentId: { in: installments.map((i) => i.id) } },
      orderBy: { paidAt: 'asc' },
    });
    const no = new Map(installments.map((i) => [i.id, i.installmentNo]));
    return payments.map((p) => paymentOut(p, no));
  });
  res.json(out);
});

const PAY_METHODS = ['UPI', 'CARD', 'NETBANKING', 'CASH', 'CHEQUE'] as const;

/**
 * POST /fees/payments — records an installment payment.
 *  - at the counter: needs fees.collect in the student's branch;
 *  - by the student / parent: only while the demo gateway is on (DEMO_PAYMENTS=true) — real online
 *    payments must come from the payment gateway's webhook.
 * The amount and late fee are worked out here; an Idempotency-Key header makes retries safe.
 */
financeRouter.post('/fees/payments', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    studentId: uuid, installmentNo: z.number().int().min(1).max(24),
    method: z.string().toUpperCase().transform((m) => (m === 'NET BANKING' ? 'NETBANKING' : m.includes('CARD') ? 'CARD' : m)).pipe(z.enum(PAY_METHODS)),
    reference: z.string().trim().max(100).optional(),
  }).parse(req.body);
  const idempotencyKey = String(req.get('idempotency-key') ?? '').slice(0, 100) || randomUUID();

  const out = await withTenant(ctx.organizationId, async (tx) => {
    const repeat = await tx.feePayment.findUnique({ where: { idempotencyKey } });
    if (repeat) {
      if (repeat.studentId !== body.studentId) throw conflict('This idempotency key was used for another payment.');
      const inst = await tx.feeInstallment.findUniqueOrThrow({ where: { id: repeat.installmentId }, select: { installmentNo: true } });
      return { payment: paymentOut(repeat, new Map([[repeat.installmentId, inst.installmentNo]])), created: false };
    }

    const student = await tx.student.findUnique({ where: { id: body.studentId }, select: { id: true, branchId: true, status: true } });
    if (!student) throw notFound('Student');
    const atCounter = ctx.access.can('fees.collect', student.branchId);
    if (!atCounter) {
      const linked = await tx.student.count({ where: { id: student.id, OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] } });
      if (!linked) throw notFound('Student');
      if (!env.DEMO_PAYMENTS) throw new AppError(403, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not set up yet — please pay at the school office.');
      if (body.method === 'CASH' || body.method === 'CHEQUE') throw badRequest('Cash and cheque are accepted at the school office only.');
    }

    const year = await currentYear(tx);
    const [account] = await feeAccounts(tx, [student.id], year.id);
    const inst = account.installments.find((i) => i.no === body.installmentNo);
    if (!inst) throw badRequest('This installment is not in the student’s fee plan.');
    if (await tx.feePayment.count({ where: { studentId: student.id, installmentId: inst.id, status: 'SUCCESS' } })) throw conflict('This installment is already paid.');
    if (inst.amount <= 0) throw badRequest('Nothing is due for this installment.');

    const daysLate = Math.max(0, Math.floor((todayUtc().getTime() - new Date(`${inst.dueDate}T00:00:00Z`).getTime()) / 86_400_000));
    const lateFee = daysLate * (await lateFeePerDay(tx, ctx.organizationId));
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: student.branchId }, select: { code: true } });
    const prefix = `${branch.code}/${String(new Date().getFullYear()).slice(2)}/`;
    const last = await tx.feePayment.findFirst({ where: { receiptNo: { startsWith: prefix } }, orderBy: { receiptNo: 'desc' }, select: { receiptNo: true } });
    const receiptNo = `${prefix}${String((Number(last?.receiptNo.slice(prefix.length)) || 0) + 1).padStart(6, '0')}`;

    const p = await tx.feePayment.create({
      data: {
        organizationId: ctx.organizationId, branchId: student.branchId, studentId: student.id, installmentId: inst.id, amount: inst.amount, lateFee,
        method: body.method, status: 'SUCCESS', receiptNo, idempotencyKey, paidAt: new Date(),
        gatewayRef: body.reference ?? (atCounter ? null : `DEMO-${Date.now()}`), receivedById: atCounter ? ctx.userId : null,
      },
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'FeePayment', entityId: p.id, branchId: student.branchId, after: { receiptNo, amount: inst.amount, lateFee, method: body.method } });
    return { payment: paymentOut(p, new Map([[inst.id, inst.no]])), created: true };
  });
  res.status(out.created ? 201 : 200).json(out.payment);
});

// ═════════════════════════════════════════════════════════════════════════════
// Expenses
// ═════════════════════════════════════════════════════════════════════════════

const EXPENSE_METHODS = ['UPI', 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD'] as const;

/** Branches whose expenses the user may see: where they record expenses or view reports. */
function expenseBranches(ctx: RequestContext) {
  const ok = (b: string) => ctx.access.can('expenses.write', b) || ctx.access.can('reports.view', b);
  const ids = ctx.activeBranchId ? (ok(ctx.activeBranchId) ? [ctx.activeBranchId] : []) : ctx.access.branchesWith().filter(ok);
  if (!ids.length) throw forbidden();
  return ids;
}

/** GET /expenses?from=&to= — default: the current academic year. */
financeRouter.get('/expenses', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ from: dateOnly.optional(), to: dateOnly.optional() }).parse(req.query);
  const branchIds = expenseBranches(ctx);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const rows = await tx.expense.findMany({ where: { branchId: { in: branchIds }, date: { gte: q.from ?? year.startDate, ...(q.to ? { lte: q.to } : {}) } }, orderBy: { date: 'desc' } });
    const linked = new Set([
      ...(await tx.vendorPayment.findMany({ where: { expenseId: { in: rows.map((r) => r.id) } }, select: { expenseId: true } })).map((v) => v.expenseId),
      ...(await tx.pettyCashVoucher.findMany({ where: { expenseId: { in: rows.map((r) => r.id) } }, select: { expenseId: true } })).map((v) => v.expenseId),
    ]);
    return rows.map((e) => ({ id: e.id, date: toDateString(e.date), category: e.category, description: e.description, amount: money(e.amount), paidTo: e.paidTo, method: e.method, fromPurchase: linked.has(e.id) }));
  });
  res.json(out);
});

/** POST /expenses — needs expenses.write. */
financeRouter.post('/expenses', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    date: dateOnly, category: z.string().trim().min(1).max(40), description: z.string().trim().min(1).max(300),
    amount: z.number().positive().max(100_000_000), paidTo: z.string().trim().max(150).nullable().optional(),
    method: z.string().trim().toUpperCase().transform((m) => m.replace(/\s+/g, '_')).pipe(z.enum(EXPENSE_METHODS)),
    branchId: uuid.optional(),
  }).parse(req.body);
  if (body.date > todayUtc()) throw badRequest('An expense cannot be dated in the future.');
  const branchId = body.branchId ?? ctx.activeBranchId ?? ctx.access.branchesWith('expenses.write')[0];
  if (!branchId || !ctx.access.can('expenses.write', branchId)) throw forbidden();
  const row = await withTenant(ctx.organizationId, async (tx) => {
    const e = await tx.expense.create({ data: { organizationId: ctx.organizationId, branchId, date: body.date, category: body.category, description: body.description, amount: body.amount, paidTo: body.paidTo ?? null, method: body.method, createdById: ctx.userId } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Expense', entityId: e.id, branchId, after: { ...body, date: toDateString(body.date) } });
    return { id: e.id, date: toDateString(e.date), category: e.category, description: e.description, amount: money(e.amount), paidTo: e.paidTo, method: e.method, fromPurchase: false };
  });
  res.status(201).json(row);
});

/** DELETE /expenses/:id — needs expenses.write; expenses booked by vendor payments or petty cash stay. */
financeRouter.delete('/expenses/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw notFound('Expense');
    if (!ctx.access.can('expenses.write', e.branchId)) throw forbidden();
    if ((await tx.vendorPayment.count({ where: { expenseId: id } })) || (await tx.pettyCashVoucher.count({ where: { expenseId: id } }))) {
      throw badRequest('This expense was booked by a purchase payment or petty-cash voucher — it cannot be deleted here.');
    }
    await tx.expense.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Expense', entityId: id, branchId: e.branchId, before: { ...e, amount: money(e.amount) } });
  });
  res.status(204).end();
});
