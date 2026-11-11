import type { RequestContext } from '../../auth/access.js';
import type { Tx } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { toDateString } from '../../lib/http.js';
import { feeAccounts } from '../finance/finance.routes.js';

/**
 * Read-only data tools for the assistant. The model only picks a tool and its arguments; the code
 * here decides what the signed-in user may see — the same permissions as the ERP pages:
 * staff see the branches where they hold the permission, students and parents only their own
 * children. Nothing here writes anything.
 */

type Args = Record<string, unknown>;
type Year = Awaited<ReturnType<typeof currentYear>>;
interface ToolEnv { tx: Tx; ctx: RequestContext; year: Year }

interface Tool {
  description: string;
  args: string;
  /** Permissions that unlock the tool for staff (any one). */
  staff: string[];
  /** Students / parents may use it for their own children. */
  self?: boolean;
  run: (env: ToolEnv, args: Args) => Promise<unknown>;
}

const DAY = 86_400_000;
const money = (value: unknown) => Math.round(Number(value ?? 0));
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const str = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 80) : '');
const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

/** Branches the user may read with one of `permissions` (the branch picked in the app, if any). */
function branchesFor(ctx: RequestContext, permissions: string[]): string[] {
  const ids = new Set<string>();
  for (const permission of permissions) {
    const list = ctx.activeBranchId
      ? ctx.access.can(permission, ctx.activeBranchId) ? [ctx.activeBranchId] : []
      : ctx.access.branchesWith(permission);
    list.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/** The user's own student record or their children (students and parents). */
async function ownStudentIds(tx: Tx, ctx: RequestContext) {
  const rows = await tx.student.findMany({
    where: { OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

const fullName = (s: { firstName: string; middleName?: string | null; lastName?: string | null }) =>
  [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');

/** "10 A", "class 10-a", "LKG B" → grade/section filters. */
function parseClass(text: string): { grade: string; section: string | null } | null {
  const match = text.toLowerCase().match(/\b(\d{1,2}|lkg|ukg|nursery|pre[- ]?nursery)\s*[- ]?\s*([a-z])?\b/);
  if (!match) return null;
  return { grade: match[1], section: match[2]?.toUpperCase() ?? null };
}

async function sectionIdsFor(tx: Tx, branchIds: string[], className: string) {
  const parsed = parseClass(className);
  if (!parsed) return null;
  const sections = await tx.section.findMany({
    where: { branchId: { in: branchIds }, ...(parsed.section ? { name: parsed.section } : {}) },
    select: { id: true, name: true, grade: { select: { name: true } } },
  });
  const wanted = parsed.grade.replace(/\s|-/g, '');
  return sections.filter((s) => {
    const words = s.grade.name.toLowerCase().replace(/-/g, '').split(/\s+/);
    return words.includes(wanted) || s.grade.name.toLowerCase().replace(/\s|-/g, '') === wanted;
  });
}

/** Students matching a name or admission number, limited to what the user may see. */
async function findStudents(env: ToolEnv, args: Args, permission: string) {
  const { tx, ctx, year } = env;
  const query = str(args.name) || str(args.student) || str(args.admissionNo);
  const branchIds = branchesFor(ctx, [permission]);
  let scope: { branchId?: { in: string[] }; id?: { in: string[] } };
  if (branchIds.length) scope = { branchId: { in: branchIds } };
  else {
    const own = await ownStudentIds(tx, ctx);
    if (!own.length) return { error: 'Aapko student records dekhne ki permission nahi hai.' };
    scope = { id: { in: own } };
    if (!query) return { students: await describeStudents(tx, year, own) };
  }
  if (!query) return { error: 'Student ka naam ya admission number batayein.' };
  const words = query.split(/\s+/).filter((w) => w.length > 1).slice(0, 3);
  const students = await tx.student.findMany({
    where: {
      ...scope,
      status: 'ACTIVE',
      OR: [
        { admissionNo: query },
        { AND: words.map((w) => ({ OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }, { middleName: { contains: w } }] })) },
      ],
    },
    select: { id: true },
    take: 6,
  });
  return { students: await describeStudents(tx, year, students.map((s) => s.id)) };
}

async function describeStudents(tx: Tx, year: Year, ids: string[]) {
  if (!ids.length) return [];
  const rows = await tx.student.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, admissionNo: true, firstName: true, middleName: true, lastName: true, gender: true, status: true,
      enrollments: { where: { academicYearId: year.id }, select: { rollNo: true, section: { select: { name: true, grade: { select: { name: true } } } } } },
      guardians: { select: { relation: true, isPrimary: true, guardian: { select: { name: true, phone: true } } } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    name: fullName(s),
    admissionNo: s.admissionNo,
    class: s.enrollments[0] ? `${s.enrollments[0].section.grade.name} ${s.enrollments[0].section.name}` : null,
    rollNo: s.enrollments[0]?.rollNo ?? null,
    gender: s.gender,
    status: s.status,
    guardians: s.guardians.map((g) => ({ relation: g.relation, name: g.guardian.name, phone: g.guardian.phone })),
  }));
}

/** One student for per-student tools; asks to be more specific when the name matches several. */
type StudentInfo = Awaited<ReturnType<typeof describeStudents>>[number];
async function oneStudent(env: ToolEnv, args: Args, permission: string): Promise<{ student: StudentInfo } | { error: string; matches?: string[] }> {
  const found = await findStudents(env, args, permission);
  if (found.error !== undefined || !found.students) return { error: found.error ?? 'Student nahi mila.' };
  const [student, ...others] = found.students;
  if (!student) return { error: `“${str(args.name)}” naam ka koi student nahi mila.` };
  if (others.length) {
    return { error: 'Is naam ke kai students hain — class ya poora naam batayein.', matches: found.students.map((s) => `${s.name} (${s.class ?? '-'}, ${s.admissionNo})`) };
  }
  return { student };
}

export const TOOLS: Record<string, Tool> = {
  school_summary: {
    description: 'School overview: total students, staff, today\'s student attendance, fee collection this year.',
    args: '{}',
    staff: ['reports.view', 'group.view'],
    run: async ({ tx, ctx, year }) => {
      const branchIds = branchesFor(ctx, ['reports.view', 'group.view']);
      const where = { branchId: { in: branchIds } };
      const day = today();
      const [branches, students, staff, teachers, sessions] = await Promise.all([
        tx.branch.findMany({ where: { id: { in: branchIds } }, select: { name: true } }),
        tx.student.findMany({ where: { ...where, status: 'ACTIVE' }, select: { id: true } }),
        tx.staff.count({ where: { ...where, status: { not: 'RESIGNED' } } }),
        tx.staff.count({ where: { ...where, status: { not: 'RESIGNED' }, staffType: 'TEACHING' } }),
        tx.attendanceSession.findMany({ where: { ...where, date: day, periodNo: null }, select: { id: true } }),
      ]);
      const entries = sessions.length
        ? await tx.attendanceEntry.groupBy({ by: ['status'], where: { sessionId: { in: sessions.map((s) => s.id) } }, _count: { _all: true } })
        : [];
      const marked = entries.reduce((t, e) => t + e._count._all, 0);
      const present = entries.filter((e) => e.status === 'PRESENT' || e.status === 'LATE').reduce((t, e) => t + e._count._all, 0);
      const accounts = await feeAccounts(tx, students.map((s) => s.id), year.id);
      const todayStr = toDateString(day)!;
      const dueSoFar = accounts.reduce((t, a) => t + a.installments.filter((i) => i.dueDate <= todayStr).reduce((s, i) => s + i.amount, 0), 0);
      const annual = accounts.reduce((t, a) => t + a.total, 0);
      const installmentIds = accounts.flatMap((a) => a.installments.map((i) => i.id));
      const paid = installmentIds.length
        ? money((await tx.feePayment.aggregate({ where: { ...where, status: 'SUCCESS', installmentId: { in: installmentIds } }, _sum: { amount: true } }))._sum.amount)
        : 0;
      return {
        schools: branches.map((b) => b.name), academicYear: year.name,
        activeStudents: students.length, staff, teachers,
        todayAttendance: marked ? { marked, present, absent: marked - present, percent: pct(present, marked) } : 'aaj ki attendance abhi nahi li gayi',
        fees: { annualTotal: Math.round(annual), dueTillToday: Math.round(dueSoFar), collected: paid, overdue: Math.max(0, Math.round(dueSoFar) - paid), collectionPercent: pct(paid, dueSoFar) },
      };
    },
  },

  find_student: {
    description: 'Find a student by name or admission number: class, roll number, parents and their phone.',
    args: '{"name":"student name or admission no"}',
    staff: ['students.read'],
    self: true,
    run: (env, args) => findStudents(env, args, 'students.read'),
  },

  student_fees: {
    description: 'One student\'s fees this year: total, paid, due, overdue, next installment.',
    args: '{"name":"student name"}',
    staff: ['fees.read', 'fees.collect'],
    self: true,
    run: async (env, args) => {
      const found = await oneStudent(env, args, env.ctx.access.canAnywhere('fees.read') ? 'fees.read' : 'fees.collect');
      if (!('student' in found)) return found;
      const { student } = found;
      const [account] = await feeAccounts(env.tx, [student.id], env.year.id);
      if (!account) return { student: student.name, fees: 'is saal ka fee plan nahi mila' };
      const payments = await env.tx.feePayment.findMany({
        where: { studentId: student.id, status: 'SUCCESS', installmentId: { in: account.installments.map((i) => i.id) } },
        select: { amount: true, installmentId: true, paidAt: true, receiptNo: true },
        orderBy: { paidAt: 'desc' },
      });
      const paidOf = (id: string) => payments.filter((p) => p.installmentId === id).reduce((t, p) => t + Number(p.amount), 0);
      const todayStr = toDateString(today())!;
      const installments = account.installments.map((i) => ({ name: i.name, dueDate: i.dueDate, amount: i.amount, paid: money(paidOf(i.id)) }));
      const paid = installments.reduce((t, i) => t + i.paid, 0);
      const dueTillToday = installments.filter((i) => i.dueDate <= todayStr).reduce((t, i) => t + i.amount, 0);
      const next = installments.find((i) => i.paid < i.amount && i.dueDate > todayStr);
      return {
        student: student.name, class: student.class, annualFee: account.total, concessionPercent: account.concessionPercent,
        paid, balance: Math.max(0, account.total - paid), overdueNow: Math.max(0, dueTillToday - paid),
        nextInstallment: next ? { name: next.name, dueDate: next.dueDate, amount: next.amount - next.paid } : null,
        lastPayment: payments[0] ? { amount: money(payments[0].amount), date: toDateString(payments[0].paidAt), receiptNo: payments[0].receiptNo } : null,
        installments,
      };
    },
  },

  student_attendance: {
    description: 'One student\'s attendance: present/absent/leave days and percentage (last 30 days by default), recent absent dates.',
    args: '{"name":"student name","days":30}',
    staff: ['attendance.read', 'students.read'],
    self: true,
    run: async (env, args) => {
      const found = await oneStudent(env, args, env.ctx.access.canAnywhere('attendance.read') ? 'attendance.read' : 'students.read');
      if (!('student' in found)) return found;
      const days = Math.min(365, Math.max(1, Number(args.days) || 30));
      const entries = await env.tx.attendanceEntry.findMany({
        where: { studentId: found.student.id, session: { periodNo: null, date: { gte: new Date(today().getTime() - days * DAY) } } },
        select: { status: true, session: { select: { date: true } } },
      });
      const count = (status: string) => entries.filter((e) => e.status === status).length;
      const present = count('PRESENT') + count('LATE');
      return {
        student: found.student.name, class: found.student.class, lastDays: days, daysMarked: entries.length,
        present, absent: count('ABSENT'), leave: count('LEAVE'), late: count('LATE'), percent: pct(present, entries.length),
        recentAbsentDates: entries.filter((e) => e.status === 'ABSENT').map((e) => toDateString(e.session.date)).sort().reverse().slice(0, 5),
      };
    },
  },

  student_marks: {
    description: 'One student\'s exam results (published exams this year): marks per subject and percentage.',
    args: '{"name":"student name"}',
    staff: ['marks.read'],
    self: true,
    run: async (env, args) => {
      const found = await oneStudent(env, args, 'marks.read');
      if (!('student' in found)) return found;
      const marks = await env.tx.mark.findMany({
        where: { studentId: found.student.id, examPaper: { exam: { academicYearId: env.year.id, resultsPublished: true } } },
        select: { marks: true, isAbsent: true, examPaper: { select: { subjectId: true, maxMarks: true, passMarks: true, exam: { select: { name: true } } } } },
      });
      const subjects = await env.tx.subject.findMany({ where: { id: { in: [...new Set(marks.map((m) => m.examPaper.subjectId))] } }, select: { id: true, name: true } });
      const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
      const exams = new Map<string, { subject: string; marks: number | 'absent'; max: number; passed: boolean }[]>();
      for (const m of marks) {
        const list = exams.get(m.examPaper.exam.name) ?? [];
        const got = m.isAbsent || m.marks === null ? 'absent' as const : Number(m.marks);
        list.push({ subject: subjectName.get(m.examPaper.subjectId) ?? 'Subject', marks: got, max: Number(m.examPaper.maxMarks), passed: got !== 'absent' && got >= Number(m.examPaper.passMarks) });
        exams.set(m.examPaper.exam.name, list);
      }
      if (!exams.size) return { student: found.student.name, results: 'is saal ka koi published result nahi hai' };
      return {
        student: found.student.name, class: found.student.class,
        exams: [...exams.entries()].map(([exam, papers]) => {
          const got = papers.reduce((t, p) => t + (p.marks === 'absent' ? 0 : p.marks), 0);
          const max = papers.reduce((t, p) => t + p.max, 0);
          return { exam, percent: pct(got, max), total: `${got}/${max}`, papers };
        }),
      };
    },
  },

  class_attendance: {
    description: 'Attendance of a class on a date (today by default): present/absent counts and the absent students\' names.',
    args: '{"className":"10 A","date":"YYYY-MM-DD optional"}',
    staff: ['attendance.read'],
    run: async ({ tx, ctx }, args) => {
      const branchIds = branchesFor(ctx, ['attendance.read']);
      const className = str(args.className) || str(args.class);
      const sections = className ? await sectionIdsFor(tx, branchIds, className) : null;
      if (!sections?.length) return { error: 'Class clearly batayein, jaise “10 A”.' };
      const date = /^\d{4}-\d{2}-\d{2}$/.test(str(args.date)) ? new Date(`${str(args.date)}T00:00:00Z`) : today();
      const sessionsFound = await tx.attendanceSession.findMany({
        where: { sectionId: { in: sections.map((s) => s.id) }, date, periodNo: null },
        select: { sectionId: true, entries: { select: { status: true, studentId: true } } },
      });
      const studentIds = sessionsFound.flatMap((s) => s.entries.filter((e) => e.status !== 'PRESENT').map((e) => e.studentId));
      const names = new Map((await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, middleName: true, lastName: true } })).map((s) => [s.id, fullName(s)]));
      return {
        date: toDateString(date),
        classes: sections.map((section) => {
          const register = sessionsFound.find((s) => s.sectionId === section.id);
          if (!register) return { class: `${section.grade.name} ${section.name}`, attendance: 'is din attendance nahi li gayi' };
          const by = (status: string) => register.entries.filter((e) => e.status === status);
          return {
            class: `${section.grade.name} ${section.name}`, total: register.entries.length,
            present: by('PRESENT').length + by('LATE').length, absent: by('ABSENT').length, leave: by('LEAVE').length,
            absentStudents: by('ABSENT').map((e) => names.get(e.studentId)), onLeave: by('LEAVE').map((e) => names.get(e.studentId)),
          };
        }),
      };
    },
  },

  fee_defaulters: {
    description: 'Students with overdue fees (optionally of one class), biggest dues first.',
    args: '{"className":"10 A optional"}',
    staff: ['fees.read'],
    run: async ({ tx, ctx, year }, args) => {
      const branchIds = branchesFor(ctx, ['fees.read']);
      const className = str(args.className) || str(args.class);
      const sections = className ? await sectionIdsFor(tx, branchIds, className) : null;
      if (className && !sections?.length) return { error: `“${className}” class nahi mili.` };
      const enrollments = await tx.enrollment.findMany({
        where: { academicYearId: year.id, branchId: { in: branchIds }, status: 'ACTIVE', ...(sections ? { sectionId: { in: sections.map((s) => s.id) } } : {}) },
        select: { studentId: true, section: { select: { name: true, grade: { select: { name: true } } } }, student: { select: { firstName: true, middleName: true, lastName: true, admissionNo: true } } },
      });
      const accounts = await feeAccounts(tx, enrollments.map((e) => e.studentId), year.id);
      const todayStr = toDateString(today())!;
      const paidRows = await tx.feePayment.groupBy({ by: ['studentId'], where: { studentId: { in: enrollments.map((e) => e.studentId) }, status: 'SUCCESS', installmentId: { in: accounts.flatMap((a) => a.installments.map((i) => i.id)) } }, _sum: { amount: true } });
      const paidOf = new Map(paidRows.map((p) => [p.studentId, money(p._sum.amount)]));
      const rows = accounts.map((a) => {
        const e = enrollments.find((x) => x.studentId === a.studentId)!;
        const due = a.installments.filter((i) => i.dueDate <= todayStr).reduce((t, i) => t + i.amount, 0);
        return { name: fullName(e.student), admissionNo: e.student.admissionNo, class: `${e.section.grade.name} ${e.section.name}`, overdue: Math.max(0, Math.round(due) - (paidOf.get(a.studentId) ?? 0)) };
      }).filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue);
      return { totalDefaulters: rows.length, totalOverdue: rows.reduce((t, r) => t + r.overdue, 0), top: rows.slice(0, 10) };
    },
  },

  find_staff: {
    description: 'Find a staff member / teacher by name or employee code: designation, department, phone, status, leaves this year.',
    args: '{"name":"staff name or code"}',
    staff: ['staff.read', 'staff.write'],
    run: async ({ tx, ctx, year }, args) => {
      const branchIds = branchesFor(ctx, ['staff.read', 'staff.write']);
      const query = str(args.name);
      if (!query) return { error: 'Staff ka naam batayein.' };
      const words = query.split(/\s+/).filter((w) => w.length > 1).slice(0, 3);
      const staff = await tx.staff.findMany({
        where: { branchId: { in: branchIds }, OR: [{ employeeCode: query }, { AND: words.map((w) => ({ name: { contains: w } })) }] },
        select: { id: true, name: true, employeeCode: true, designation: true, department: true, staffType: true, phone: true, email: true, status: true, joiningDate: true },
        take: 6,
      });
      const leaves = await tx.leaveRequest.findMany({
        where: { staffId: { in: staff.map((s) => s.id) }, status: 'APPROVED', fromDate: { gte: year.startDate } },
        select: { staffId: true, fromDate: true, toDate: true, type: true },
      });
      return {
        staff: staff.map((s) => ({
          name: s.name, code: s.employeeCode, designation: s.designation, department: s.department, type: s.staffType,
          phone: s.phone, email: s.email, status: s.status, joined: toDateString(s.joiningDate),
          leaveDaysThisYear: leaves.filter((l) => l.staffId === s.id).reduce((t, l) => t + Math.round((l.toDate.getTime() - l.fromDate.getTime()) / DAY) + 1, 0),
        })),
      };
    },
  },

  staff_leaves: {
    description: 'Staff on leave today and leave requests waiting for approval.',
    args: '{}',
    staff: ['leave.approve', 'staff.read'],
    run: async ({ tx, ctx }) => {
      const branchIds = branchesFor(ctx, ['leave.approve', 'staff.read']);
      const day = today();
      const [onLeave, pending] = await Promise.all([
        tx.leaveRequest.findMany({ where: { branchId: { in: branchIds }, status: 'APPROVED', fromDate: { lte: day }, toDate: { gte: day } }, select: { type: true, toDate: true, staff: { select: { name: true, designation: true } } } }),
        tx.leaveRequest.findMany({ where: { branchId: { in: branchIds }, status: 'PENDING' }, select: { type: true, fromDate: true, toDate: true, staff: { select: { name: true } } }, orderBy: { fromDate: 'asc' }, take: 10 }),
      ]);
      return {
        onLeaveToday: onLeave.map((l) => ({ name: l.staff.name, designation: l.staff.designation, type: l.type, until: toDateString(l.toDate) })),
        pendingRequests: pending.map((l) => ({ name: l.staff.name, type: l.type, from: toDateString(l.fromDate), to: toDateString(l.toDate) })),
      };
    },
  },

  low_stock: {
    description: 'Store items below their minimum stock level.',
    args: '{}',
    staff: ['inventory.manage'],
    run: async ({ tx, ctx }) => {
      const items = await tx.inventoryItem.findMany({ where: { branchId: { in: branchesFor(ctx, ['inventory.manage']) } }, select: { name: true, quantity: true, minQuantity: true, unit: true, location: true } });
      const low = items.filter((i) => i.quantity < i.minQuantity);
      return { totalItems: items.length, lowStock: low.length, items: low.slice(0, 15).map((i) => ({ name: i.name, have: `${i.quantity} ${i.unit}`, minimum: i.minQuantity, location: i.location })) };
    },
  },

  library_overdue: {
    description: 'Library books not returned after the due date.',
    args: '{}',
    staff: ['library.manage'],
    run: async ({ tx, ctx }) => {
      const loans = await tx.bookLoan.findMany({
        where: { branchId: { in: branchesFor(ctx, ['library.manage']) }, returnDate: null, isDigital: false, dueDate: { lt: today() } },
        select: { dueDate: true, studentId: true, staffId: true, bookId: true },
        orderBy: { dueDate: 'asc' }, take: 15,
      });
      const [books, students, staff] = await Promise.all([
        tx.book.findMany({ where: { id: { in: loans.map((l) => l.bookId) } }, select: { id: true, title: true } }),
        tx.student.findMany({ where: { id: { in: loans.flatMap((l) => (l.studentId ? [l.studentId] : [])) } }, select: { id: true, firstName: true, middleName: true, lastName: true } }),
        tx.staff.findMany({ where: { id: { in: loans.flatMap((l) => (l.staffId ? [l.staffId] : [])) } }, select: { id: true, name: true } }),
      ]);
      return {
        overdue: loans.map((l) => ({
          book: books.find((b) => b.id === l.bookId)?.title,
          borrower: l.studentId ? fullName(students.find((s) => s.id === l.studentId) ?? { firstName: 'Student' }) : staff.find((s) => s.id === l.staffId)?.name,
          dueDate: toDateString(l.dueDate),
          daysLate: Math.round((today().getTime() - l.dueDate.getTime()) / DAY),
        })),
      };
    },
  },
};

/** Tools this user may call (by permission), for the model's menu. */
export async function availableTools(tx: Tx, ctx: RequestContext) {
  const isSelf = (await ownStudentIds(tx, ctx)).length > 0;
  return Object.entries(TOOLS)
    .filter(([, tool]) => tool.staff.some((p) => branchesFor(ctx, [p]).length > 0) || (tool.self && isSelf))
    .map(([name]) => name);
}

/** Runs a tool for this user. Unknown or not-allowed tools return an error object, never throw. */
export async function runTool(tx: Tx, ctx: RequestContext, name: string, args: Args, allowed: string[]) {
  const tool = TOOLS[name];
  if (!tool || !allowed.includes(name)) return { error: 'Yeh jaankari aapke role ke liye available nahi hai.' };
  const year = await currentYear(tx);
  return tool.run({ tx, ctx, year }, args);
}
