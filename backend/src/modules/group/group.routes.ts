import { Router } from 'express';
import { withTenant } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { forbidden } from '../../lib/errors.js';
import { toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { feeAccounts } from '../finance/finance.routes.js';

/**
 * The group dashboard: the schools (branches) in the caller's scope side by side — students, staff,
 * fees, attendance, results, spending, admissions and purchasing. Only totals per school, never
 * anyone's personal records. Needs `group.view` (chairman, group heads, regional managers…).
 *
 * The numbers are computed live. For chains of hundreds of schools they should come from a nightly
 * snapshot instead (see TODO.md).
 */
export const groupRouter = Router();

const DAY = 86_400_000;
const money = (d: unknown) => Math.round(Number(d ?? 0));
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** GET /group/overview — every school the caller may compare, with group totals and region subtotals. */
groupRouter.get('/group/overview', async (req, res) => {
  const ctx = ctxOf(req);
  // the whole scope, whatever branch the app is working in
  const branchIds = ctx.access.branchesWith('group.view');
  if (!branchIds.length) throw forbidden('The group dashboard is for the head office and regional managers.');

  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const since30 = new Date(today.getTime() - 30 * DAY);
    const inYear = { gte: year.startDate, lte: year.endDate };

    const [branches, regions] = await Promise.all([
      tx.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, code: true, name: true, city: true, regionId: true, isActive: true }, orderBy: { name: 'asc' } }),
      tx.region.findMany({ select: { id: true, name: true } }),
    ]);
    const regionName = new Map(regions.map((r) => [r.id, r.name]));
    const where = { branchId: { in: branchIds } };

    // ── people ──
    const [studentsBy, admittedBy, staffBy, teachersBy] = await Promise.all([
      tx.student.groupBy({ by: ['branchId'], where: { ...where, status: 'ACTIVE' }, _count: { _all: true } }),
      tx.student.groupBy({ by: ['branchId'], where: { ...where, admissionDate: inYear }, _count: { _all: true } }),
      tx.staff.groupBy({ by: ['branchId'], where: { ...where, status: { not: 'RESIGNED' } }, _count: { _all: true } }),
      tx.staff.groupBy({ by: ['branchId'], where: { ...where, status: { not: 'RESIGNED' }, staffType: 'TEACHING' }, _count: { _all: true } }),
    ]);

    // ── fees: this year's accounts (same rule as the fees pages) against what was paid for them ──
    const students = await tx.student.findMany({ where: { ...where, status: 'ACTIVE' }, select: { id: true } });
    const accounts = await feeAccounts(tx, students.map((s) => s.id), year.id);
    const installmentIds = accounts.flatMap((a) => a.installments.map((i) => i.id));
    const paid = installmentIds.length
      ? await tx.feePayment.groupBy({ by: ['branchId'], where: { ...where, status: 'SUCCESS', installmentId: { in: installmentIds } }, _sum: { amount: true } })
      : [];
    const todayStr = toDateString(today)!;
    const feeOf = new Map<string, { annual: number; dueSoFar: number }>();
    for (const a of accounts) {
      const f = feeOf.get(a.branchId) ?? { annual: 0, dueSoFar: 0 };
      f.annual += a.total;
      f.dueSoFar += a.installments.filter((i) => i.dueDate <= todayStr).reduce((t, i) => t + i.amount, 0);
      feeOf.set(a.branchId, f);
    }
    // collection by month for the trend (last 6 months, every payment)
    const sixMonths = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
    const recentPayments = await tx.feePayment.findMany({ where: { ...where, status: 'SUCCESS', paidAt: { gte: sixMonths } }, select: { branchId: true, amount: true, paidAt: true } });

    // ── attendance, last 30 days ──
    const sessions = await tx.attendanceSession.findMany({ where: { ...where, date: { gte: since30, lte: today } }, select: { id: true, branchId: true } });
    const sessionBranch = new Map(sessions.map((s) => [s.id, s.branchId]));
    const entries = sessions.length
      ? await tx.attendanceEntry.groupBy({ by: ['sessionId', 'status'], where: { sessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } })
      : [];
    const attOf = new Map<string, { present: number; total: number }>();
    for (const e of entries) {
      const b = sessionBranch.get(e.sessionId)!;
      const a = attOf.get(b) ?? { present: 0, total: 0 };
      a.total += e._count._all;
      if (e.status === 'PRESENT' || e.status === 'LATE') a.present += e._count._all;
      attOf.set(b, a);
    }

    // ── results: published exams of this year ──
    const papers = await tx.examPaper.findMany({ where: { exam: { academicYearId: year.id, resultsPublished: true } }, select: { id: true, maxMarks: true } });
    const maxOf = new Map(papers.map((p) => [p.id, Number(p.maxMarks)]));
    const marks = papers.length
      ? await tx.mark.groupBy({ by: ['branchId', 'examPaperId'], where: { ...where, examPaperId: { in: papers.map((p) => p.id) }, isAbsent: false, marks: { not: null } }, _sum: { marks: true }, _count: { _all: true } })
      : [];
    const resOf = new Map<string, { got: number; max: number }>();
    for (const m of marks) {
      const r = resOf.get(m.branchId) ?? { got: 0, max: 0 };
      r.got += Number(m._sum.marks ?? 0);
      r.max += (maxOf.get(m.examPaperId) ?? 0) * m._count._all;
      resOf.set(m.branchId, r);
    }

    // ── money out: expenses this year, the latest payroll ──
    const [expensesBy, runs] = await Promise.all([
      tx.expense.groupBy({ by: ['branchId'], where: { ...where, date: inYear }, _sum: { amount: true } }),
      tx.payrollRun.findMany({ where, orderBy: { month: 'desc' }, select: { id: true, branchId: true, month: true } }),
    ]);
    const latestRun = new Map<string, { id: string; month: string }>();
    for (const r of runs) if (!latestRun.has(r.branchId)) latestRun.set(r.branchId, r);
    const payslips = latestRun.size
      ? await tx.payslip.groupBy({ by: ['payrollRunId'], where: { payrollRunId: { in: [...latestRun.values()].map((r) => r.id) } }, _sum: { net: true } })
      : [];
    const payrollNet = new Map(payslips.map((p) => [p.payrollRunId, money(p._sum.net)]));

    // ── admissions pipeline, purchasing, stock ──
    const [enquiriesBy, openPrs, openPos, items] = await Promise.all([
      tx.enquiry.groupBy({ by: ['branchId'], where: { ...where, status: { notIn: ['ADMITTED', 'CLOSED'] } }, _count: { _all: true } }),
      tx.indent.groupBy({ by: ['branchId'], where: { ...where, status: { in: ['PENDING_HOD', 'PENDING_STORE', 'PENDING_PRINCIPAL', 'PENDING_MANAGEMENT', 'APPROVED_FOR_PURCHASE'] } }, _count: { _all: true } }),
      tx.purchaseOrder.findMany({ where: { ...where, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } }, select: { branchId: true, gstPercent: true, lines: { select: { qty: true, received: true, rate: true } } } }),
      tx.inventoryItem.findMany({ where, select: { branchId: true, quantity: true, minQuantity: true } }),
    ]);

    const count = (rows: { branchId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.branchId === id)?._count._all ?? 0;
    const schools = branches.map((b) => {
      const fee = feeOf.get(b.id) ?? { annual: 0, dueSoFar: 0 };
      const collected = money(paid.find((p) => p.branchId === b.id)?._sum.amount);
      const att = attOf.get(b.id);
      const res = resOf.get(b.id);
      const run = latestRun.get(b.id);
      return {
        id: b.id, code: b.code, name: b.name, city: b.city, region: b.regionId ? regionName.get(b.regionId) ?? null : null, regionId: b.regionId, isActive: b.isActive,
        students: count(studentsBy, b.id), admittedThisYear: count(admittedBy, b.id),
        staff: count(staffBy, b.id), teachers: count(teachersBy, b.id),
        fees: {
          annual: Math.round(fee.annual), dueSoFar: Math.round(fee.dueSoFar), collected,
          overdue: Math.max(0, Math.round(fee.dueSoFar) - collected), collectionPercent: pct(collected, fee.dueSoFar),
        },
        attendancePercent: att ? pct(att.present, att.total) : null,
        resultPercent: res ? pct(res.got, res.max) : null,
        expenses: money(expensesBy.find((e) => e.branchId === b.id)?._sum.amount),
        payroll: run ? { month: run.month, net: payrollNet.get(run.id) ?? 0 } : null,
        openEnquiries: count(enquiriesBy, b.id),
        openRequisitions: count(openPrs, b.id),
        openOrderValue: Math.round(openPos.filter((p) => p.branchId === b.id).reduce((t, p) => t + p.lines.reduce((s, l) => s + (l.qty - l.received) * Number(l.rate), 0) * (1 + Number(p.gstPercent) / 100), 0)),
        lowStockItems: items.filter((i) => i.branchId === b.id && i.quantity < i.minQuantity).length,
        studentsPerTeacher: count(teachersBy, b.id) ? Math.round((count(studentsBy, b.id) / count(teachersBy, b.id)) * 10) / 10 : null,
      };
    });

    // ── totals: the whole scope, and per region ──
    const total = (list: typeof schools) => {
      const att = list.map((s) => attOf.get(s.id)).filter(Boolean) as { present: number; total: number }[];
      const res = list.map((s) => resOf.get(s.id)).filter(Boolean) as { got: number; max: number }[];
      const dueSoFar = list.reduce((t, s) => t + s.fees.dueSoFar, 0);
      const collected = list.reduce((t, s) => t + s.fees.collected, 0);
      return {
        schools: list.length, students: list.reduce((t, s) => t + s.students, 0), admittedThisYear: list.reduce((t, s) => t + s.admittedThisYear, 0),
        staff: list.reduce((t, s) => t + s.staff, 0), teachers: list.reduce((t, s) => t + s.teachers, 0),
        fees: { annual: list.reduce((t, s) => t + s.fees.annual, 0), dueSoFar, collected, overdue: list.reduce((t, s) => t + s.fees.overdue, 0), collectionPercent: pct(collected, dueSoFar) },
        attendancePercent: pct(att.reduce((t, a) => t + a.present, 0), att.reduce((t, a) => t + a.total, 0)),
        resultPercent: pct(res.reduce((t, r) => t + r.got, 0), res.reduce((t, r) => t + r.max, 0)),
        expenses: list.reduce((t, s) => t + s.expenses, 0), payroll: list.reduce((t, s) => t + (s.payroll?.net ?? 0), 0),
        openEnquiries: list.reduce((t, s) => t + s.openEnquiries, 0), openRequisitions: list.reduce((t, s) => t + s.openRequisitions, 0),
        openOrderValue: list.reduce((t, s) => t + s.openOrderValue, 0), lowStockItems: list.reduce((t, s) => t + s.lowStockItems, 0),
      };
    };
    const regionIds = [...new Set(schools.map((s) => s.regionId))];
    const months = Array.from({ length: 6 }, (_, k) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5 + k, 1)).toISOString().slice(0, 7));

    return {
      academicYear: year.name, generatedAt: new Date().toISOString(),
      totals: total(schools),
      regions: regionIds.length > 1 || regionIds[0] ? regionIds.map((id) => ({ id, name: id ? regionName.get(id) ?? 'Region' : 'No region', ...total(schools.filter((s) => s.regionId === id)) })) : [],
      schools,
      collectionTrend: months.map((m) => ({
        month: m,
        bySchool: Object.fromEntries(schools.map((s) => [s.id, money(recentPayments.filter((p) => p.branchId === s.id && p.paidAt.toISOString().startsWith(m)).reduce((t, p) => t + Number(p.amount), 0))])),
      })),
    };
  });
  res.json(out);
});
