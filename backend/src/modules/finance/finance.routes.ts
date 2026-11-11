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
import { expenseAccountForCategory, paymentLedgerLine, postJournal } from './ledger.js';

/**
 * Fees (multi-head structure, student accounts, payments) and expenses.
 *
 * A student's fee for the year = the TUITION plan of their grade, less their concessions (capped at
 * 100 %), split into the plan's installments by percentage (the last one takes the rounding).
 * Existing tuition account fields are preserved for student and group dashboard clients.
 */
export const financeRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const money = (d: unknown) => Math.round(Number(d ?? 0) * 100) / 100;
const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

const lateFeeRuleSchema = z.object({
  type: z.enum(['DAILY_FLAT', 'FLAT', 'PERCENTAGE', 'DAILY_COMPOUND']),
  amount: z.number().min(0).max(100_000),
});
type LateFeeRule = z.infer<typeof lateFeeRuleSchema>;
const DEFAULT_LATE_FEE_RULE: LateFeeRule = { type: 'DAILY_FLAT', amount: 10 };

async function organizationSettings(tx: Tx, organizationId: string) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  try {
    return JSON.parse(org.settings ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function lateFeeRule(tx: Tx, organizationId: string): Promise<LateFeeRule> {
  const settings = await organizationSettings(tx, organizationId);
  const parsed = lateFeeRuleSchema.safeParse(settings.lateFeeRule);
  if (parsed.success) return parsed.data;
  const legacy = Number(settings.lateFeePerDay ?? DEFAULT_LATE_FEE_RULE.amount);
  return Number.isFinite(legacy) && legacy >= 0 ? { type: 'DAILY_FLAT', amount: legacy } : DEFAULT_LATE_FEE_RULE;
}

function calculateLateFee(rule: LateFeeRule, principal: number, daysLate: number) {
  if (daysLate <= 0 || principal <= 0) return 0;
  if (rule.type === 'FLAT') return money(rule.amount);
  if (rule.type === 'DAILY_FLAT') return money(rule.amount * daysLate);
  if (rule.type === 'PERCENTAGE') return money(principal * rule.amount / 100);
  let total = principal;
  for (let day = 0; day < Math.min(daysLate, 3650); day++) {
    total = Math.min(100_000_000, total * (1 + rule.amount / 100));
  }
  return money(total - principal);
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
  feeHeads: { feeHead: string; annualAmount: number; concessionPercent: number; total: number; components: { name: string; amount: number }[]; installments: { id: string; no: number; name: string; dueDate: string; percent: number; amount: number }[] }[];
};

const feeComponentsSchema = z.array(z.object({
  name: z.string().trim().min(1).max(80),
  amount: z.number().min(0).max(10_000_000),
})).min(1).max(30).superRefine((components, issue) => {
  const names = components.map((component) => component.name.toLocaleLowerCase());
  if (new Set(names).size !== names.length) {
    issue.addIssue({ code: 'custom', message: 'Fee component names must be unique.', path: [] });
  }
});

function componentsFromPlan(value: string | null, annualAmount: number) {
  if (!value) return [{ name: 'General fee', amount: money(annualAmount) }];
  return feeComponentsSchema.parse(JSON.parse(value)).map((component) => ({ ...component, amount: money(component.amount) }));
}

function scaleComponents(components: { name: string; amount: number }[], total: number) {
  const cents = Math.round(total * 100);
  const componentTotal = components.reduce((sum, component) => sum + component.amount, 0);
  if (componentTotal <= 0) return components.map((component) => ({ name: component.name, amount: 0 }));
  let assigned = 0;
  return components.map((component, index) => {
    const amountCents = index === components.length - 1
      ? cents - assigned
      : Math.min(cents - assigned, Math.round(cents * component.amount / componentTotal));
    assigned += amountCents;
    return { name: component.name, amount: amountCents / 100 };
  });
}

/** Fee accounts (this academic year) for the given students. Also used by the group dashboard. */
export async function feeAccounts(tx: Tx, studentIds: string[], yearId: string): Promise<Account[]> {
  if (!studentIds.length) return [];
  const [students, enrollments, concessions] = await Promise.all([
    tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, branchId: true } }),
    tx.enrollment.findMany({ where: { academicYearId: yearId, studentId: { in: studentIds } }, select: { studentId: true, section: { select: { gradeId: true } } } }),
    tx.feeConcession.findMany({ where: { academicYearId: yearId, studentId: { in: studentIds } }, select: { studentId: true, percent: true } }),
  ]);
  const gradeOf = new Map(enrollments.map((e) => [e.studentId, e.section.gradeId]));
  const plans = await tx.feePlan.findMany({
  where: { academicYearId: yearId, gradeId: { in: [...new Set(gradeOf.values())] } },
    include: { installments: { orderBy: { installmentNo: 'asc' } } },
  });
  const planOf = new Map<string, typeof plans>();
  for (const plan of plans) planOf.set(plan.gradeId, [...(planOf.get(plan.gradeId) ?? []), plan]);
  const concessionOf = new Map<string, number>();
  for (const c of concessions) concessionOf.set(c.studentId, (concessionOf.get(c.studentId) ?? 0) + Number(c.percent));

  return students.map((s) => {
    const gradeId = gradeOf.get(s.id) ?? null;
    const gradePlans = gradeId ? planOf.get(gradeId) ?? [] : [];
    const tuitionPlan = gradePlans.find((plan) => plan.feeHead === 'TUITION');
    const annualFee = money(tuitionPlan?.annualAmount ?? 0);
    const concessionPercent = Math.min(100, concessionOf.get(s.id) ?? 0);
    const total = Math.round((annualFee * (100 - concessionPercent)) / 100);
    const amounts = split(total, tuitionPlan?.installments.map((i) => Number(i.percent)) ?? []);
    return {
      studentId: s.id, branchId: s.branchId, gradeId, annualFee, concessionPercent, total,
      installments: (tuitionPlan?.installments ?? []).map((i, k) => ({ id: i.id, no: i.installmentNo, name: i.name, dueDate: toDateString(i.dueDate)!, amount: amounts[k] })),
      feeHeads: gradePlans.map((plan) => {
        const amount = money(plan.annualAmount);
        const concession = plan.feeHead === 'TUITION' ? concessionPercent : 0;
        const netAmount = Math.round((amount * (100 - concession)) / 100);
        const installmentAmounts = split(netAmount, plan.installments.map((item) => Number(item.percent)));
        return {
          feeHead: plan.feeHead,
          annualAmount: amount,
          concessionPercent: concession,
          total: netAmount,
          components: scaleComponents(componentsFromPlan(plan.components, amount), netAmount),
          installments: plan.installments.map((item, index) => ({
            id: item.id, no: item.installmentNo, name: item.name, dueDate: toDateString(item.dueDate)!, percent: Number(item.percent), amount: installmentAmounts[index],
          })),
        };
      }),
    };
  });
}

/** Students covered by a fee read: staff with fees.read in their branches, or the caller's own children. */
async function feeStudents(tx: Tx, ctx: RequestContext, yearId: string) {
  const scope = await readScope(tx, ctx, 'fees.read', yearId);
  if (scope.kind === 'self') return scope.studentIds;
  return (await tx.student.findMany({ where: { branchId: { in: scope.branchIds }, status: 'ACTIVE' }, select: { id: true } })).map((s) => s.id);
}

type PaymentInstallmentInfo = { installmentNo: number; feeHead: string };
const paymentOut = (p: { id: string; studentId: string; installmentId: string; amount: unknown; lateFee: unknown; method: string; status: string; receiptNo: string; gatewayRef: string | null; paidAt: Date }, installments: Map<string, PaymentInstallmentInfo>) => ({
  id: p.id, studentId: p.studentId, installmentId: p.installmentId,
  installmentNo: installments.get(p.installmentId)?.installmentNo ?? 0,
  feeHead: installments.get(p.installmentId)?.feeHead ?? 'TUITION', amount: money(p.amount), lateFee: money(p.lateFee),
  method: p.method, status: p.status, receiptNo: p.receiptNo, gatewayRef: p.gatewayRef, paidAt: toDateString(p.paidAt),
});

// ═════════════════════════════════════════════════════════════════════════════
// Fee structure
// ═════════════════════════════════════════════════════════════════════════════

/** GET /fees/structure — fee heads per grade with configurable installment schedules. */
financeRouter.get('/fees/structure', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = memberBranches(ctx);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const grades = await tx.grade.findMany({ where: { branchId: { in: branchIds } }, select: { id: true, name: true, sortOrder: true, branchId: true }, orderBy: { sortOrder: 'asc' } });
    const plans = await tx.feePlan.findMany({ where: { academicYearId: year.id, gradeId: { in: grades.map((g) => g.id) } }, include: { installments: { orderBy: { installmentNo: 'asc' } } } });
    const planOf = new Map<string, typeof plans>();
    for (const plan of plans) planOf.set(plan.gradeId, [...(planOf.get(plan.gradeId) ?? []), plan]);
    const lateRule = await lateFeeRule(tx, ctx.organizationId);
    return {
      lateFeeRule: lateRule,
      lateFeePerDay: lateRule.type === 'DAILY_FLAT' ? lateRule.amount : 0,
      grades: grades.map((g) => {
        const gradePlans = planOf.get(g.id) ?? [];
        const p = gradePlans.find((plan) => plan.feeHead === 'TUITION');
        return {
          gradeId: g.id, grade: g.name, sortOrder: g.sortOrder, branchId: g.branchId, annualAmount: p ? money(p.annualAmount) : null,
          installments: (p?.installments ?? []).map((i) => ({ no: i.installmentNo, name: i.name, dueDate: toDateString(i.dueDate), percent: Number(i.percent) })),
          feeHeads: gradePlans.map((plan) => ({
            feeHead: plan.feeHead, annualAmount: money(plan.annualAmount),
            installments: plan.installments.map((i) => ({ no: i.installmentNo, name: i.name, dueDate: toDateString(i.dueDate), percent: Number(i.percent) })),
            components: plan.components ? componentsFromPlan(plan.components, money(plan.annualAmount)) : null,
          })),
        };
      }),
    };
  });
  res.json(out);
});

/**
 * PUT /fees/structure/:gradeId — sets an annual fee head and optional installment schedule.
 * A new plan copies the installment schedule of the branch's other plans (or one installment at the start of the year).
 */
financeRouter.put('/fees/structure/:gradeId', async (req, res) => {
  const ctx = ctxOf(req);
  const gradeId = idParam(req, 'gradeId');
  const body = z.object({
    feeHead: z.enum(['TUITION', 'TRANSPORT', 'HOSTEL', 'LIBRARY', 'EXAMINATION', 'LAB', 'ADMISSION', 'SECURITY_DEPOSIT', 'EXAM', 'OTHER']).default('TUITION'),
    annualAmount: z.number().min(0).max(10_000_000),
    components: feeComponentsSchema.nullable().optional(),
    installments: z.array(z.object({
      no: z.number().int().min(1).max(24),
      name: z.string().trim().min(1).max(60),
      dueDate: dateOnly,
      percent: z.number().gt(0).max(100),
    })).min(1).max(24).optional(),
  }).superRefine((value, issue) => {
    if (value.installments && Math.abs(value.installments.reduce((sum, item) => sum + item.percent, 0) - 100) > 0.01) {
      issue.addIssue({ code: 'custom', message: 'Installment percentages must add up to 100.', path: ['installments'] });
    }
    if (value.installments && new Set(value.installments.map((item) => item.no)).size !== value.installments.length) {
      issue.addIssue({ code: 'custom', message: 'Installment numbers must be unique.', path: ['installments'] });
    }
    if (value.components && Math.abs(money(value.components.reduce((sum, item) => sum + item.amount, 0)) - money(value.annualAmount)) > 0.01) {
      issue.addIssue({ code: 'custom', message: 'Fee component amounts must add up to the annual amount.', path: ['components'] });
    }
  }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const grade = await tx.grade.findUnique({ where: { id: gradeId }, select: { id: true, branchId: true, name: true } });
    if (!grade) throw notFound('Class');
    if (!ctx.access.can('fees.structure', grade.branchId)) throw forbidden();
    const year = await currentYear(tx);
    const existing = await tx.feePlan.findFirst({ where: { academicYearId: year.id, gradeId, feeHead: body.feeHead }, include: { installments: true } });
    let planId: string;
    if (existing) {
      if (existing.components && !body.components && money(existing.annualAmount) !== money(body.annualAmount)) {
        throw conflict('Update the component amounts together with the annual fee.');
      }
      if (body.installments) {
        const paid = await tx.feePayment.count({ where: { installmentId: { in: existing.installments.map((item) => item.id) }, status: { in: ['SUCCESS', 'REFUNDED'] } } });
        if (paid) throw conflict('This fee schedule already has payments. Create a new fee plan in a future academic year instead.');
      }
      await tx.feePlan.update({
        where: { id: existing.id },
        data: {
          annualAmount: body.annualAmount,
          ...(body.components !== undefined ? { components: body.components ? JSON.stringify(body.components) : null } : {}),
          ...(body.installments ? {
            installments: {
              deleteMany: {},
              create: body.installments.map((item) => ({
                organizationId: ctx.organizationId, installmentNo: item.no, name: item.name, dueDate: item.dueDate, percent: item.percent,
              })),
            },
          } : {}),
        },
      });
      planId = existing.id;
    } else {
      const template = await tx.feePlan.findFirst({ where: { academicYearId: year.id, branchId: grade.branchId, feeHead: body.feeHead }, include: { installments: true } });
      const schedule = body.installments?.map((item) => ({ installmentNo: item.no, name: item.name, dueDate: item.dueDate, percent: item.percent })) ?? (template?.installments.length
        ? template.installments.map((i) => ({ installmentNo: i.installmentNo, name: i.name, dueDate: i.dueDate, percent: i.percent }))
        : [{ installmentNo: 1, name: 'Annual Fee', dueDate: year.startDate, percent: 100 }]);
      const plan = await tx.feePlan.create({
        data: {
          organizationId: ctx.organizationId, branchId: grade.branchId, academicYearId: year.id, gradeId, feeHead: body.feeHead, annualAmount: body.annualAmount,
          ...(body.components ? { components: JSON.stringify(body.components) } : {}),
          installments: { create: schedule.map((i) => ({ organizationId: ctx.organizationId, ...i })) },
        },
      });
      planId = plan.id;
    }
    await audit(tx, ctx, { action: existing ? 'UPDATE' : 'CREATE', entity: 'FeePlan', entityId: planId, branchId: grade.branchId, before: existing ? { annualAmount: money(existing.annualAmount), feeHead: existing.feeHead } : undefined, after: { grade: grade.name, ...body } });
    return { gradeId, feeHead: body.feeHead, annualAmount: body.annualAmount };
  });
  res.json(out);
});

financeRouter.put('/fees/rules', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({ lateFeeRule: lateFeeRuleSchema }).parse(req.body);
  const branchIds = ctx.access.branchesWith('fees.structure');
  if (!branchIds.length) throw forbidden();
  await withTenant(ctx.organizationId, async (tx) => {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } });
    const settings = await organizationSettings(tx, ctx.organizationId);
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { settings: JSON.stringify({ ...settings, lateFeeRule: body.lateFeeRule, lateFeePerDay: body.lateFeeRule.type === 'DAILY_FLAT' ? body.lateFeeRule.amount : 0 }) },
    });
    await audit(tx, ctx, {
      action: 'UPDATE', entity: 'Organization', entityId: ctx.organizationId,
      before: { lateFeeRule: settings.lateFeeRule ?? { type: 'DAILY_FLAT', amount: Number(settings.lateFeePerDay ?? DEFAULT_LATE_FEE_RULE.amount) } },
      after: { lateFeeRule: body.lateFeeRule, settingsWereConfigured: organization.settings !== null },
    });
  });
  res.json(body);
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

financeRouter.get('/fees/students/:studentId/concessions', async (req, res) => {
  const ctx = ctxOf(req);
  const studentId = idParam(req, 'studentId');
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, branchId: true } });
    if (!student) throw notFound('Student');
    if (!ctx.access.can('fees.read', student.branchId) && !ctx.access.can('fees.structure', student.branchId)) throw forbidden();
    const year = await currentYear(tx);
    return tx.feeConcession.findMany({ where: { studentId, academicYearId: year.id }, orderBy: { type: 'asc' } });
  });
  res.json(rows.map((row) => ({ id: row.id, type: row.type, percent: Number(row.percent) })));
});

financeRouter.put('/fees/students/:studentId/concessions/:type', async (req, res) => {
  const ctx = ctxOf(req);
  const studentId = idParam(req, 'studentId');
  const type = z.enum(['MERIT', 'SIBLING', 'STAFF_WARD', 'RTE', 'NEED_BASED', 'CATEGORY']).parse(req.params.type);
  const body = z.object({ percent: z.number().gt(0).max(100) }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, branchId: true } });
    if (!student) throw notFound('Student');
    if (!ctx.access.can('fees.structure', student.branchId)) throw forbidden();
    const year = await currentYear(tx);
    const unique = { studentId_academicYearId_type: { studentId, academicYearId: year.id, type } };
    const before = await tx.feeConcession.findUnique({ where: { studentId_academicYearId_type: unique.studentId_academicYearId_type } });
    const row = before
      ? await tx.feeConcession.update({ where: { studentId_academicYearId_type: unique.studentId_academicYearId_type }, data: { percent: body.percent, approvedById: ctx.userId } })
      : await tx.feeConcession.create({ data: { organizationId: ctx.organizationId, studentId, academicYearId: year.id, type, percent: body.percent, approvedById: ctx.userId } });
    await audit(tx, ctx, {
      action: before ? 'UPDATE' : 'CREATE', entity: 'FeeConcession', entityId: row.id, branchId: student.branchId,
      before: before ? { type, percent: Number(before.percent) } : undefined,
      after: { type, percent: Number(row.percent), academicYear: year.name },
    });
    return { id: row.id, type: row.type, percent: Number(row.percent) };
  });
  res.json(out);
});

financeRouter.delete('/fees/students/:studentId/concessions/:type', async (req, res) => {
  const ctx = ctxOf(req);
  const studentId = idParam(req, 'studentId');
  const type = z.enum(['MERIT', 'SIBLING', 'STAFF_WARD', 'RTE', 'NEED_BASED', 'CATEGORY']).parse(req.params.type);
  await withTenant(ctx.organizationId, async (tx) => {
    const student = await tx.student.findUnique({ where: { id: studentId }, select: { id: true, branchId: true } });
    if (!student) throw notFound('Student');
    if (!ctx.access.can('fees.structure', student.branchId)) throw forbidden();
    const year = await currentYear(tx);
    const row = await tx.feeConcession.findUnique({ where: { studentId_academicYearId_type: { studentId, academicYearId: year.id, type } } });
    if (!row) throw notFound('Fee concession');
    await tx.feeConcession.delete({ where: { id: row.id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'FeeConcession', entityId: row.id, branchId: student.branchId, before: { type, percent: Number(row.percent) } });
  });
  res.status(204).end();
});

financeRouter.post('/fees/payments/:paymentId/refunds', async (req, res) => {
  const ctx = ctxOf(req);
  const paymentId = idParam(req, 'paymentId');
  const body = z.object({
    amount: z.number().positive().max(100_000_000).multipleOf(0.01),
    method: z.enum(['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH']),
    reason: z.string().trim().min(3).max(300),
    reference: z.string().trim().max(100).optional(),
  }).parse(req.body);
  const refund = await withTenant(ctx.organizationId, async (tx) => {
    const payment = await tx.feePayment.findUnique({ where: { id: paymentId } });
    if (!payment || !['SUCCESS', 'REFUNDED'].includes(payment.status)) throw notFound('Successful fee payment');
    if (!ctx.access.can('fees.structure', payment.branchId)) throw forbidden();
    await tx.$queryRaw`SELECT [id] FROM dbo.[FeePayment] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${paymentId}`;
    const existing = await tx.feeRefund.aggregate({ where: { paymentId }, _sum: { amount: true } });
    const refunded = money(existing._sum.amount);
    const refundable = money(money(payment.amount) - refunded);
    if (refundable <= 0) throw conflict('This payment has already been fully refunded.');
    if (Math.round(body.amount * 100) > Math.round(refundable * 100)) {
      throw badRequest(`The remaining refundable amount is ₹${refundable.toLocaleString('en-IN')}.`);
    }

    const branch = await tx.branch.findUniqueOrThrow({ where: { id: payment.branchId }, select: { code: true } });
    const prefix = `${branch.code}/RF${String(new Date().getFullYear()).slice(-2)}/`;
    const last = await tx.feeRefund.findFirst({ where: { refundNo: { startsWith: prefix } }, orderBy: { refundNo: 'desc' }, select: { refundNo: true } });
    const refundNo = `${prefix}${String((Number(last?.refundNo.slice(prefix.length)) || 0) + 1).padStart(6, '0')}`;
    const row = await tx.feeRefund.create({
      data: {
        organizationId: ctx.organizationId, branchId: payment.branchId, paymentId, refundNo,
        amount: body.amount, method: body.method, reason: body.reason,
        reference: body.reference || null, refundedAt: new Date(), refundedById: ctx.userId,
      },
    });
    const installment = await tx.feeInstallment.findUniqueOrThrow({
      where: { id: payment.installmentId }, include: { feePlan: { select: { feeHead: true } } },
    });
    const debitAccount = installment.feePlan.feeHead === 'SECURITY_DEPOSIT' ? '2200'
      : installment.feePlan.feeHead === 'TUITION' ? '4000'
        : installment.feePlan.feeHead === 'TRANSPORT' ? '4010'
          : installment.feePlan.feeHead === 'HOSTEL' ? '4020' : '4030';
    const refundBankType = installment.feePlan.feeHead === 'HOSTEL' ? 'HOSTEL'
      : installment.feePlan.feeHead === 'SECURITY_DEPOSIT' ? 'TRUST' : 'OPERATING';
    const refundPaymentAccount = await paymentLedgerLine(tx, payment.branchId, body.method, refundBankType);
    await postJournal(tx, ctx, {
      branchId: payment.branchId, date: row.refundedAt, description: `Fee refund ${refundNo} · receipt ${payment.receiptNo}`,
      sourceType: 'FEE_REFUND', sourceId: row.id,
      lines: [
        { accountCode: debitAccount, description: body.reason, debit: body.amount },
        { ...refundPaymentAccount, description: `Refund ${refundNo}`, credit: body.amount },
      ],
    });
    const totalRefunded = money(refunded + body.amount);
    if (totalRefunded >= money(payment.amount)) {
      await tx.feePayment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
      await audit(tx, ctx, {
        action: 'UPDATE', entity: 'FeePayment', entityId: paymentId, branchId: payment.branchId,
        before: { status: payment.status }, after: { status: 'REFUNDED' },
      });
    }
    await audit(tx, ctx, { action: 'CREATE', entity: 'FeeRefund', entityId: row.id, branchId: payment.branchId, after: { refundNo, amount: body.amount, method: body.method, reasonProvided: true } });
    return { id: row.id, refundNo: row.refundNo, paymentId, amount: money(row.amount), method: row.method, reason: row.reason, reference: row.reference, refundedAt: toDateString(row.refundedAt), receiptNo: payment.receiptNo };
  });
  res.status(201).json(refund);
});

financeRouter.get('/fees/refunds', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const studentIds = await feeStudents(tx, ctx, year.id);
    const rows = await tx.feeRefund.findMany({
      where: { payment: { is: { studentId: { in: studentIds } } } },
      include: { payment: { select: { receiptNo: true, studentId: true, amount: true } } },
      orderBy: { refundedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id, refundNo: row.refundNo, paymentId: row.paymentId, receiptNo: row.payment.receiptNo,
      studentId: row.payment.studentId, amount: money(row.amount), method: row.method, reason: row.reason,
      reference: row.reference, refundedAt: toDateString(row.refundedAt),
    }));
  });
  res.json(out);
});

financeRouter.get('/fees/payments/:paymentId/receipt', async (req, res) => {
  const ctx = ctxOf(req);
  const paymentId = idParam(req, 'paymentId');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const studentIds = await feeStudents(tx, ctx, year.id);
    const payment = await tx.feePayment.findFirst({ where: { id: paymentId, studentId: { in: studentIds } } });
    if (!payment) throw notFound('Fee receipt');
    const [student, installment] = await Promise.all([
      tx.student.findUnique({ where: { id: payment.studentId }, select: { firstName: true, middleName: true, lastName: true, admissionNo: true } }),
      tx.feeInstallment.findUnique({
        where: { id: payment.installmentId },
        select: { installmentNo: true, feePlan: { select: { feeHead: true } } },
      }),
    ]);
    if (!student || !installment) throw notFound('Fee receipt details');
    const studentName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
    const refunds = await tx.feeRefund.findMany({
      where: { paymentId },
      orderBy: { refundedAt: 'asc' },
      select: { refundNo: true, amount: true, method: true, reason: true, refundedAt: true },
    });
    return {
      receiptNo: payment.receiptNo, studentName, rollNo: student.admissionNo,
      feeHead: installment.feePlan.feeHead, installmentNo: installment.installmentNo,
      amount: money(payment.amount), lateFee: money(payment.lateFee), method: payment.method,
      reference: payment.gatewayRef, paidAt: toDateString(payment.paidAt),
      refundedAmount: money(refunds.reduce((sum, refund) => sum + money(refund.amount), 0)),
      refunds: refunds.map((refund) => ({
        refundNo: refund.refundNo, amount: money(refund.amount), method: refund.method,
        reason: refund.reason, refundedAt: toDateString(refund.refundedAt),
      })),
    };
  });
  res.json(out);
});

/** GET /fees/payments — successful and refunded receipts this year (staff: branch; parents: children). */
financeRouter.get('/fees/payments', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const studentIds = await feeStudents(tx, ctx, year.id);
    const installments = await tx.feeInstallment.findMany({ where: { feePlan: { academicYearId: year.id } }, select: { id: true, installmentNo: true, feePlan: { select: { feeHead: true } } } });
    const payments = await tx.feePayment.findMany({
      where: { studentId: { in: studentIds }, status: { in: ['SUCCESS', 'REFUNDED'] }, installmentId: { in: installments.map((i) => i.id) } },
      orderBy: { paidAt: 'asc' },
    });
    const refunds = await tx.feeRefund.findMany({
      where: { paymentId: { in: payments.map((payment) => payment.id) } },
      select: { paymentId: true, amount: true },
    });
    const refundedByPayment = new Map<string, number>();
    for (const refund of refunds) {
      refundedByPayment.set(refund.paymentId, money((refundedByPayment.get(refund.paymentId) ?? 0) + money(refund.amount)));
    }
    const info = new Map(installments.map((i) => [i.id, { installmentNo: i.installmentNo, feeHead: i.feePlan.feeHead }]));
    return payments.map((p) => ({
      ...paymentOut(p, info),
      refundedAmount: refundedByPayment.get(p.id) ?? 0,
      netAmount: money(money(p.amount) - (refundedByPayment.get(p.id) ?? 0)),
      status: p.status,
    }));
  });
  res.json(out);
});

const PAY_METHODS = ['UPI', 'CARD', 'NETBANKING', 'CASH', 'CHEQUE', 'DEMAND_DRAFT', 'POS'] as const;

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
    studentId: uuid,
    installmentNo: z.number().int().min(1).max(24).optional(),
    installmentId: uuid.optional(),
    method: z.string().trim().toUpperCase().transform((m) => {
      if (m === 'NET BANKING') return 'NETBANKING';
      if (m === 'DEMAND DRAFT' || m === 'DD') return 'DEMAND_DRAFT';
      if (m === 'POS MACHINE') return 'POS';
      return m.includes('CARD') ? 'CARD' : m;
    }).pipe(z.enum(PAY_METHODS)),
    reference: z.string().trim().max(100).optional(),
  }).refine((value) => value.installmentId !== undefined || value.installmentNo !== undefined, 'Provide the installment to pay.').parse(req.body);
  const idempotencyKey = String(req.get('idempotency-key') ?? '').slice(0, 100) || randomUUID();

  const out = await withTenant(ctx.organizationId, async (tx) => {
    const repeat = await tx.feePayment.findUnique({ where: { idempotencyKey } });
    if (repeat) {
      if (repeat.studentId !== body.studentId) throw conflict('This idempotency key was used for another payment.');
      const inst = await tx.feeInstallment.findUniqueOrThrow({ where: { id: repeat.installmentId }, select: { installmentNo: true, feePlan: { select: { feeHead: true } } } });
      return { payment: paymentOut(repeat, new Map([[repeat.installmentId, { installmentNo: inst.installmentNo, feeHead: inst.feePlan.feeHead }]])), created: false };
    }

    const student = await tx.student.findUnique({ where: { id: body.studentId }, select: { id: true, branchId: true, status: true } });
    if (!student) throw notFound('Student');
    const atCounter = ctx.access.can('fees.collect', student.branchId);
    if (!atCounter) {
      const linked = await tx.student.count({ where: { id: student.id, OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] } });
      if (!linked) throw notFound('Student');
      if (!env.DEMO_PAYMENTS) throw new AppError(403, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not set up yet — please pay at the school office.');
      if (['CASH', 'CHEQUE', 'DEMAND_DRAFT', 'POS'].includes(body.method)) throw badRequest('Cash, cheque, demand draft and POS are accepted at the school office only.');
    }

    const year = await currentYear(tx);
    const [account] = await feeAccounts(tx, [student.id], year.id);
    const feeHead = account.feeHeads.find((head) => body.installmentId
      ? head.installments.some((installment) => installment.id === body.installmentId)
      : head.feeHead === 'TUITION' && head.installments.some((installment) => installment.no === body.installmentNo));
    const inst = feeHead?.installments.find((installment) => body.installmentId
      ? installment.id === body.installmentId
      : feeHead.feeHead === 'TUITION' && installment.no === body.installmentNo);
    if (!feeHead || !inst) throw badRequest('This installment is not in the student’s fee plan.');
    await tx.$queryRaw`SELECT [id] FROM dbo.[FeeInstallment] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = ${inst.id}`;
    const previousPayments = await tx.feePayment.findMany({
      where: { studentId: student.id, installmentId: inst.id, status: { in: ['SUCCESS', 'REFUNDED'] } },
      select: { id: true, amount: true },
    });
    const previousRefunds = await tx.feeRefund.findMany({
      where: { paymentId: { in: previousPayments.map((payment) => payment.id) } },
      select: { paymentId: true, amount: true },
    });
    const refundedByPayment = new Map<string, number>();
    for (const refund of previousRefunds) {
      refundedByPayment.set(refund.paymentId, money((refundedByPayment.get(refund.paymentId) ?? 0) + money(refund.amount)));
    }
    const collected = money(previousPayments.reduce((sum, payment) => sum + money(money(payment.amount) - (refundedByPayment.get(payment.id) ?? 0)), 0));
    const amountDue = money(inst.amount - collected);
    if (amountDue <= 0) throw conflict('This installment is already paid.');

    const daysLate = Math.max(0, Math.floor((todayUtc().getTime() - new Date(`${inst.dueDate}T00:00:00Z`).getTime()) / 86_400_000));
    const lateFee = calculateLateFee(await lateFeeRule(tx, ctx.organizationId), amountDue, daysLate);
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: student.branchId }, select: { code: true } });
    const prefix = `${branch.code}/${String(new Date().getFullYear()).slice(2)}/`;
    const last = await tx.feePayment.findFirst({ where: { receiptNo: { startsWith: prefix } }, orderBy: { receiptNo: 'desc' }, select: { receiptNo: true } });
    const receiptNo = `${prefix}${String((Number(last?.receiptNo.slice(prefix.length)) || 0) + 1).padStart(6, '0')}`;

    const p = await tx.feePayment.create({
      data: {
        organizationId: ctx.organizationId, branchId: student.branchId, studentId: student.id, installmentId: inst.id, amount: amountDue, lateFee,
        method: body.method, status: 'SUCCESS', receiptNo, idempotencyKey, paidAt: new Date(),
        gatewayRef: body.reference ?? (atCounter ? null : `DEMO-${Date.now()}`), receivedById: atCounter ? ctx.userId : null,
      },
    });
    const installment = await tx.feeInstallment.findUniqueOrThrow({
      where: { id: inst.id }, include: { feePlan: { select: { feeHead: true } } },
    });
    const feeAccount = installment.feePlan.feeHead === 'SECURITY_DEPOSIT' ? '2200'
      : installment.feePlan.feeHead === 'TUITION' ? '4000'
      : installment.feePlan.feeHead === 'TRANSPORT' ? '4010'
        : installment.feePlan.feeHead === 'HOSTEL' ? '4020' : '4030';
    const bankType = installment.feePlan.feeHead === 'HOSTEL' ? 'HOSTEL'
      : installment.feePlan.feeHead === 'SECURITY_DEPOSIT' ? 'TRUST' : 'OPERATING';
    const cashAccount = await paymentLedgerLine(tx, student.branchId, body.method, bankType);
    await postJournal(tx, ctx, {
      branchId: student.branchId, date: p.paidAt, description: `Fee receipt ${receiptNo}`,
      sourceType: 'FEE_PAYMENT', sourceId: p.id,
      lines: [
        { ...cashAccount, description: `Receipt ${receiptNo}`, debit: amountDue + lateFee },
        ...(amountDue > 0 ? [{ accountCode: feeAccount, description: installment.feePlan.feeHead, credit: amountDue }] : []),
        ...(lateFee > 0 ? [{ accountCode: '4040', description: 'Late fee', credit: lateFee }] : []),
      ],
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'FeePayment', entityId: p.id, branchId: student.branchId, after: { receiptNo, amount: amountDue, lateFee, method: body.method } });
    return { payment: paymentOut(p, new Map([[inst.id, { installmentNo: inst.no, feeHead: feeHead.feeHead }]])), created: true };
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
    return rows.map((e) => ({ id: e.id, date: toDateString(e.date), category: e.category, description: e.description, amount: money(e.amount), paidTo: e.paidTo, method: e.method, department: e.department, fromPurchase: linked.has(e.id) }));
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
    department: z.string().trim().min(2).max(100).optional(),
    branchId: uuid.optional(),
  }).parse(req.body);
  if (body.date > todayUtc()) throw badRequest('An expense cannot be dated in the future.');
  const branchId = body.branchId ?? ctx.activeBranchId ?? ctx.access.branchesWith('expenses.write')[0];
  if (!branchId || !ctx.access.can('expenses.write', branchId)) throw forbidden();
  const row = await withTenant(ctx.organizationId, async (tx) => {
    const e = await tx.expense.create({ data: { organizationId: ctx.organizationId, branchId, date: body.date, category: body.category, description: body.description, amount: body.amount, paidTo: body.paidTo ?? null, method: body.method, department: body.department ?? null, createdById: ctx.userId } });
    const paymentAccount = await paymentLedgerLine(tx, branchId, body.method);
    await postJournal(tx, ctx, {
      branchId, date: body.date, description: body.description, sourceType: 'EXPENSE', sourceId: e.id,
      lines: [
        { accountCode: expenseAccountForCategory(body.category), description: body.category, debit: body.amount },
        { ...paymentAccount, description: `Paid by ${body.method}`, credit: body.amount },
      ],
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Expense', entityId: e.id, branchId, after: { ...body, date: toDateString(body.date) } });
    return { id: e.id, date: toDateString(e.date), category: e.category, description: e.description, amount: money(e.amount), paidTo: e.paidTo, method: e.method, department: e.department, fromPurchase: false };
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
