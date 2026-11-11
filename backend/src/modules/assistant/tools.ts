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
  /** Anyone signed in (the tool itself limits what it shows). */
  everyone?: boolean;
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
  const className = str(args.className);
  const inClass = className && branchIds.length ? await sectionIdsFor(tx, branchIds, className) : null;
  const students = await tx.student.findMany({
    where: {
      ...scope,
      status: 'ACTIVE',
      ...(inClass ? { enrollments: { some: { academicYearId: year.id, sectionId: { in: inClass.map((c) => c.id) } } } } : {}),
      OR: [
        { admissionNo: query },
        // names start with the spoken word: "Riya" finds Riya Sharma, not Priya or Shriya
        { AND: words.map((w) => ({ OR: [{ firstName: { startsWith: w } }, { lastName: { startsWith: w } }, { middleName: { startsWith: w } }] })) },
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


const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A YYYY-MM-DD argument, or today. */
function dateArg(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : today();
}

async function ownStaffId(tx: Tx, ctx: RequestContext) {
  return (await tx.staff.findFirst({ where: { userId: ctx.userId }, select: { id: true } }))?.id ?? null;
}

async function staffNames(tx: Tx, ids: (string | null)[]) {
  const list = [...new Set(ids.filter((id): id is string => !!id))];
  const rows = list.length ? await tx.staff.findMany({ where: { id: { in: list } }, select: { id: true, name: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Students and parents with no staff role see only their own children's things. */
async function isSelfOnly(tx: Tx, ctx: RequestContext) {
  return ctx.access.branchesWith().length === 0 || (ctx.access.branchesWith('students.read').length === 0 && (await ownStudentIds(tx, ctx)).length > 0);
}

/** Branches whose shared information (holidays, exams, notices) the user sees. */
async function visibleBranches(env: ToolEnv) {
  const { tx, ctx } = env;
  const staff = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.access.branchesWith();
  if (staff.length) return staff;
  const own = await tx.student.findMany({ where: { OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] }, select: { branchId: true } });
  return [...new Set(own.map((s) => s.branchId))];
}

type SectionRef = { id: string; name: string; gradeName: string };
/** The class a question is about: the one named (students / parents: only their own child's), else the child's class. */
async function sectionsInQuestion(env: ToolEnv, args: Args): Promise<{ sections: SectionRef[] } | { error: string }> {
  const { tx, ctx, year } = env;
  const className = str(args.className) || str(args.class);
  const selfOnly = await isSelfOnly(tx, ctx);
  let childSections: SectionRef[] = [];
  if (selfOnly) {
    const own = await ownStudentIds(tx, ctx);
    const enrollments = await tx.enrollment.findMany({
      where: { academicYearId: year.id, studentId: { in: own } },
      select: { section: { select: { id: true, name: true, grade: { select: { name: true } } } } },
    });
    childSections = [...new Map(enrollments.map((e) => [e.section.id, { id: e.section.id, name: `${e.section.grade.name} ${e.section.name}`, gradeName: e.section.grade.name }])).values()];
  }
  if (className) {
    const found = await sectionIdsFor(tx, await visibleBranches(env), className);
    let sections = (found ?? []).map((s) => ({ id: s.id, name: `${s.grade.name} ${s.name}`, gradeName: s.grade.name }));
    if (selfOnly) sections = sections.filter((s) => childSections.some((c) => c.id === s.id));
    if (!sections.length) return { error: `“${className}” class nahi mili${selfOnly ? ' (aap sirf apne bachche ki class dekh sakte hain)' : ''}.` };
    return { sections };
  }
  return { sections: childSections };
}

/** Good-morning briefing: what this person should know today. */
async function briefing(env: ToolEnv): Promise<unknown> {
  const { tx, ctx } = env;
  const can = (permission: string) => branchesFor(ctx, [permission]).length > 0;
  const run = async (name: string, args: Args = {}) => (await TOOLS[name].run(env, args)) as Record<string, any>;
  const nextHoliday = ((await run('holidays')).holidays ?? [])[0] ?? null;
  if (can('reports.view')) {
    const branchIds = branchesFor(ctx, ['reports.view']);
    const [summary, leaves, sections] = await Promise.all([
      run('school_summary'),
      can('leave.approve') || can('staff.read') ? run('staff_leaves') : Promise.resolve(null),
      tx.section.findMany({ where: { branchId: { in: branchIds } }, select: { id: true, name: true, grade: { select: { name: true, sortOrder: true } } } }),
    ]);
    const taken = await tx.attendanceSession.findMany({ where: { sectionId: { in: sections.map((s) => s.id) }, date: today(), periodNo: null }, select: { sectionId: true } });
    const missing = sections.filter((s) => !taken.some((t) => t.sectionId === s.id)).sort((a, b) => a.grade.sortOrder - b.grade.sortOrder || a.name.localeCompare(b.name)).map((s) => `${s.grade.name} ${s.name}`);
    const lowStock = can('inventory.manage') ? (await run('low_stock')).lowStock ?? null : null;
    return { kind: 'office', name: ctx.name, summary, leaves, attendanceMissing: missing, totalClasses: sections.length, lowStock, nextHoliday };
  }
  const staffId = await ownStaffId(tx, ctx);
  if (staffId) {
    const [timetable, homework, myClass] = await Promise.all([
      run('timetable'), run('homework'),
      tx.section.findFirst({ where: { classTeacherId: staffId }, select: { id: true, name: true, grade: { select: { name: true } } } }),
    ]);
    let myClassAttendance: unknown = null;
    if (myClass) {
      const register = await tx.attendanceSession.findFirst({ where: { sectionId: myClass.id, date: today(), periodNo: null }, select: { entries: { select: { status: true } } } });
      myClassAttendance = {
        class: `${myClass.grade.name} ${myClass.name}`, taken: !!register,
        present: register?.entries.filter((e) => e.status === 'PRESENT' || e.status === 'LATE').length ?? 0,
        absent: register?.entries.filter((e) => e.status === 'ABSENT').length ?? 0,
      };
    }
    return { kind: 'teacher', name: ctx.name, timetable, homework: homework.homework ?? [], myClassAttendance, nextHoliday };
  }
  const own = await ownStudentIds(tx, ctx);
  if (own.length) {
    const kids = await describeStudents(tx, env.year, own);
    const children = [];
    for (const kid of kids.slice(0, 3)) {
      const fees = (await TOOLS.student_fees.run(env, { name: kid.admissionNo })) as Record<string, any>;
      const entry = await tx.attendanceEntry.findFirst({ where: { studentId: kid.id, session: { date: today(), periodNo: null } }, select: { status: true } });
      children.push({ name: kid.name, class: kid.class, todayAttendance: entry?.status ?? null, overdue: fees.overdueNow ?? 0, nextInstallment: fees.nextInstallment ?? null });
    }
    const [homework, exams] = await Promise.all([run('homework'), run('exam_schedule')]);
    return { kind: 'family', name: ctx.name, children, homework: (homework.homework ?? []).slice(0, 5), nextExam: (exams.papers ?? [])[0] ?? null, nextHoliday };
  }
  return { kind: 'basic', name: ctx.name, nextHoliday };
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

  // ── everyday information ────────────────────────────────────────────────

  timetable: {
    description: 'Timetable for a day: a class\'s periods, the teacher\'s own periods, or the child\'s class.',
    args: '{"className":"10 A optional","date":"YYYY-MM-DD optional"}',
    staff: [],
    everyone: true,
    run: async (env, args) => {
      const { tx, ctx } = env;
      const date = dateArg(args.date);
      const dow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      const day = DAY_NAMES[dow];
      const target = await sectionsInQuestion(env, args);
      if ('error' in target) return target;
      if (target.sections.length) {
        const periods = await tx.timetablePeriod.findMany({
          where: { dayOfWeek: dow, sectionSubject: { sectionId: { in: target.sections.map((s) => s.id) }, academicYearId: env.year.id } },
          select: { periodNo: true, startTime: true, endTime: true, sectionSubject: { select: { sectionId: true, teacherId: true, subject: { select: { name: true } } } } },
          orderBy: [{ periodNo: 'asc' }],
        });
        const teachers = await staffNames(tx, periods.map((p) => p.sectionSubject.teacherId));
        return {
          day, date: toDateString(date),
          classes: target.sections.map((s) => ({
            class: s.name,
            periods: periods.filter((p) => p.sectionSubject.sectionId === s.id).map((p) => ({
              period: p.periodNo, time: `${p.startTime}-${p.endTime}`, subject: p.sectionSubject.subject.name,
              teacher: p.sectionSubject.teacherId ? teachers.get(p.sectionSubject.teacherId) ?? null : null,
            })),
          })),
        };
      }
      const staffId = await ownStaffId(tx, ctx);
      if (!staffId) return { error: 'Class batayein, jaise “10 A ka timetable”.' };
      const periods = await tx.timetablePeriod.findMany({
        where: { dayOfWeek: dow, sectionSubject: { teacherId: staffId, academicYearId: env.year.id } },
        select: { periodNo: true, startTime: true, endTime: true, sectionSubject: { select: { subject: { select: { name: true } }, section: { select: { name: true, grade: { select: { name: true } } } } } } },
        orderBy: [{ periodNo: 'asc' }],
      });
      return {
        day, date: toDateString(date), mine: true,
        periods: periods.map((p) => ({ period: p.periodNo, time: `${p.startTime}-${p.endTime}`, subject: p.sectionSubject.subject.name, class: `${p.sectionSubject.section.grade.name} ${p.sectionSubject.section.name}` })),
      };
    },
  },

  homework: {
    description: 'Homework / assignments due in the next 7 days for a class, the teacher\'s classes or the child\'s class.',
    args: '{"className":"10 A optional"}',
    staff: [],
    everyone: true,
    run: async (env, args) => {
      const { tx, ctx } = env;
      const target = await sectionsInQuestion(env, args);
      if ('error' in target) return target;
      let where: object;
      if (target.sections.length) where = { sectionId: { in: target.sections.map((s) => s.id) } };
      else {
        const staffId = await ownStaffId(tx, ctx);
        if (!staffId) return { error: 'Class batayein, jaise “10 A ka homework”.' };
        where = { teacherId: staffId };
      }
      const from = today();
      const rows = await tx.assignment.findMany({
        where: { ...where, dueDate: { gte: from, lte: new Date(from.getTime() + 7 * DAY) } },
        select: { title: true, dueDate: true, subjectId: true, sectionId: true },
        orderBy: { dueDate: 'asc' }, take: 15,
      });
      const [subjects, sections] = await Promise.all([
        tx.subject.findMany({ where: { id: { in: rows.map((r) => r.subjectId) } }, select: { id: true, name: true } }),
        tx.section.findMany({ where: { id: { in: rows.map((r) => r.sectionId) } }, select: { id: true, name: true, grade: { select: { name: true } } } }),
      ]);
      return {
        homework: rows.map((r) => ({
          title: r.title, due: toDateString(r.dueDate),
          subject: subjects.find((s) => s.id === r.subjectId)?.name ?? '',
          class: (() => { const s = sections.find((x) => x.id === r.sectionId); return s ? `${s.grade.name} ${s.name}` : ''; })(),
        })),
      };
    },
  },

  exam_schedule: {
    description: 'Upcoming exam papers (date sheet), for a class or the child\'s class if known.',
    args: '{"className":"10 A optional"}',
    staff: [],
    everyone: true,
    run: async (env, args) => {
      const { tx } = env;
      const target = await sectionsInQuestion(env, args);
      if ('error' in target) return target;
      const grades = [...new Set(target.sections.map((s) => s.gradeName))];
      const branchIds = await visibleBranches(env);
      const papers = await tx.examPaper.findMany({
        where: { date: { gte: today() }, exam: { academicYearId: env.year.id, OR: [{ branchId: null }, { branchId: { in: branchIds } }] } },
        select: { date: true, startTime: true, endTime: true, subjectId: true, maxMarks: true, exam: { select: { name: true, gradeNames: true } } },
        orderBy: { date: 'asc' }, take: 60,
      });
      const forGrades = grades.length ? papers.filter((p) => p.exam.gradeNames.split(',').map((g) => g.trim()).some((g) => grades.includes(g))) : papers;
      const subjects = await tx.subject.findMany({ where: { id: { in: forGrades.map((p) => p.subjectId) } }, select: { id: true, name: true } });
      return {
        for: grades.length ? grades.join(', ') : 'all classes',
        papers: forGrades.slice(0, 12).map((p) => ({
          exam: p.exam.name, date: toDateString(p.date), time: `${p.startTime}-${p.endTime}`,
          subject: subjects.find((s) => s.id === p.subjectId)?.name ?? '', maxMarks: Number(p.maxMarks),
          ...(grades.length ? {} : { classes: p.exam.gradeNames }),
        })),
      };
    },
  },

  transport: {
    description: 'A student\'s school bus: route, stop, pickup time, vehicle and driver.',
    args: '{"name":"student name"}',
    staff: ['transport.manage', 'students.read'],
    self: true,
    run: async (env, args) => {
      const found = await oneStudent(env, args, env.ctx.access.canAnywhere('transport.manage') ? 'transport.manage' : 'students.read');
      if (!('student' in found)) return found;
      const allocation = await env.tx.transportAllocation.findFirst({
        where: { studentId: found.student.id, academicYearId: env.year.id },
        select: { stopId: true },
      });
      if (!allocation) return { student: found.student.name, transport: 'school transport nahi leta / leti' };
      const stop = await env.tx.routeStop.findUnique({ where: { id: allocation.stopId }, select: { name: true, routeId: true } });
      const route = stop ? await env.tx.transportRoute.findUnique({ where: { id: stop.routeId }, select: { name: true, pickupTime: true, vehicleId: true } }) : null;
      const vehicle = route?.vehicleId ? await env.tx.vehicle.findUnique({ where: { id: route.vehicleId }, select: { registrationNo: true, type: true, driverStaffId: true } }) : null;
      const driver = vehicle?.driverStaffId ? await env.tx.staff.findUnique({ where: { id: vehicle.driverStaffId }, select: { name: true, phone: true } }) : null;
      return {
        student: found.student.name, class: found.student.class,
        route: route?.name ?? null, stop: stop?.name ?? null, pickupTime: route?.pickupTime ?? null,
        vehicle: vehicle ? `${vehicle.type} ${vehicle.registrationNo}` : null,
        driver: driver ? `${driver.name}${driver.phone ? ` (${driver.phone})` : ''}` : null,
      };
    },
  },

  holidays: {
    description: 'Upcoming school holidays and vacations (next 90 days).',
    args: '{}',
    staff: [],
    everyone: true,
    run: async (env) => {
      const branchIds = await visibleBranches(env);
      const from = today();
      const rows = await env.tx.holiday.findMany({
        where: { endDate: { gte: from }, startDate: { lte: new Date(from.getTime() + 90 * DAY) }, OR: [{ branchId: null }, { branchId: { in: branchIds } }] },
        select: { name: true, startDate: true, endDate: true, type: true },
        orderBy: { startDate: 'asc' }, take: 10,
      });
      return { holidays: rows.map((h) => ({ name: h.name, from: toDateString(h.startDate), to: toDateString(h.endDate), type: h.type })) };
    },
  },

  notices: {
    description: 'Notices / circulars on the notice board the user can see, newest first, optionally matching words.',
    args: '{"query":"words optional"}',
    staff: [],
    everyone: true,
    run: async (env, args) => {
      const { tx, ctx } = env;
      const own = await ownStudentIds(tx, ctx);
      const selfOnly = own.length > 0 && ctx.access.branchesWith('students.read').length === 0;
      let where: object;
      if (selfOnly) {
        const enrollments = await tx.enrollment.findMany({ where: { academicYearId: env.year.id, studentId: { in: own } }, select: { sectionId: true, branchId: true } });
        const isParent = !(await tx.student.count({ where: { userId: ctx.userId } }));
        where = {
          OR: [{ branchId: { in: [...new Set(enrollments.map((e) => e.branchId))] } }, { branchId: null }],
          audiences: { some: { OR: [{ audienceType: { in: ['EVERYONE', 'STUDENTS', ...(isParent ? ['PARENTS'] : [])] } }, { audienceType: 'SECTION', sectionId: { in: enrollments.map((e) => e.sectionId) } }] } },
        };
      } else {
        const branchIds = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.access.branchesWith();
        if (!branchIds.length) return { error: 'Notice board dekhne ki permission nahi hai.' };
        where = { OR: [{ branchId: { in: branchIds } }, { branchId: null }] };
      }
      const rows = await tx.announcement.findMany({ where, select: { title: true, body: true, category: true, priority: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 });
      const words = str(args.query).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const matching = words.length ? rows.filter((r) => words.some((w) => `${r.title} ${r.body}`.toLowerCase().includes(w))) : rows;
      return {
        query: words.join(' ') || null,
        notices: matching.slice(0, 5).map((r) => ({ title: r.title, text: r.body.replace(/\s+/g, ' ').slice(0, 220), category: r.category, priority: r.priority, date: toDateString(r.createdAt) })),
      };
    },
  },

  my_payslip: {
    description: 'The signed-in staff member\'s own latest salary slip (gross, deductions, net).',
    args: '{}',
    staff: [],
    everyone: true,
    run: async ({ tx, ctx }) => {
      const staffId = await ownStaffId(tx, ctx);
      if (!staffId) return { error: 'Salary slip sirf staff ke liye hai.' };
      const slip = await tx.payslip.findFirst({
        where: { staffId },
        select: { gross: true, deductions: true, net: true, payrollRun: { select: { month: true, status: true, paidAt: true } } },
        orderBy: { payrollRun: { month: 'desc' } },
      });
      if (!slip) return { error: 'Abhi aapki koi salary slip nahi bani.' };
      return { month: slip.payrollRun.month, status: slip.payrollRun.status, paidOn: toDateString(slip.payrollRun.paidAt), gross: money(slip.gross), deductions: money(slip.deductions), net: money(slip.net) };
    },
  },

  school_info: {
    description: 'The school\'s contact details and website information (phone, email, address, timings, admissions).',
    args: '{}',
    staff: [],
    everyone: true,
    run: async ({ tx, ctx }) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true, contactEmail: true, contactPhone: true, settings: true } });
      let site: Record<string, unknown> = {};
      try { site = (JSON.parse(org.settings ?? '{}').website ?? {}) as Record<string, unknown>; } catch { /* no website profile */ }
      const facts: Record<string, string> = {};
      for (const [key, value] of Object.entries(site)) {
        if (typeof value === 'string' && value.trim() && value.length <= 300 && /phone|email|address|timing|hours|admission|board|affiliation|principal|established|city|whatsapp|session/i.test(key)) facts[key] = value.trim();
        if (typeof value === 'boolean' && /admission/i.test(key)) facts[key] = value ? 'yes' : 'no';
      }
      return { school: org.name, phone: org.contactPhone, email: org.contactEmail, ...facts };
    },
  },

  daily_briefing: {
    description: 'Good-morning briefing for the signed-in person: what needs attention today.',
    args: '{}',
    staff: [],
    everyone: true,
    run: async (env) => briefing(env),
  },

  // ── actions: Jarvis prepares, the person confirms, the normal ERP endpoint does the work ──

  leave_decision: {
    description: 'Prepare approving or rejecting a staff member\'s pending leave request (the user confirms).',
    args: '{"name":"staff name","decision":"APPROVED|REJECTED"}',
    staff: ['leave.approve'],
    run: async ({ tx, ctx }, args) => {
      const query = str(args.name);
      const decision = args.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
      const words = query.split(/\s+/).filter((w) => w.length > 1).slice(0, 3);
      const pending = await tx.leaveRequest.findMany({
        where: { branchId: { in: branchesFor(ctx, ['leave.approve']) }, status: 'PENDING', ...(words.length ? { staff: { AND: words.map((w) => ({ name: { contains: w } })) } } : {}) },
        select: { id: true, type: true, fromDate: true, toDate: true, reason: true, staff: { select: { name: true, userId: true } } },
        orderBy: { fromDate: 'asc' }, take: 6,
      });
      const decidable = pending.filter((l) => l.staff.userId !== ctx.userId);
      if (!decidable.length) return { error: query ? `${query} ki koi pending leave request nahi mili.` : 'Koi pending leave request nahi hai.' };
      if (decidable.length > 1) return { error: 'Kai pending leave requests hain — naam batayein.', matches: decidable.map((l) => `${l.staff.name} (${toDateString(l.fromDate)} se ${toDateString(l.toDate)})`) };
      const leave = decidable[0];
      const days = Math.round((leave.toDate.getTime() - leave.fromDate.getTime()) / DAY) + 1;
      return {
        action: {
          method: 'PATCH', path: `/leaves/${leave.id}`, body: { status: decision },
          title: decision === 'APPROVED' ? 'Leave approve karein?' : 'Leave reject karein?',
          summary: `${leave.staff.name} — ${leave.type} leave, ${toDateString(leave.fromDate)} se ${toDateString(leave.toDate)} (${days} din). Reason: ${leave.reason}`,
          confirm: decision === 'APPROVED' ? 'Haan, approve karo' : 'Haan, reject karo',
          done: `${leave.staff.name} ki leave ${decision === 'APPROVED' ? 'approve' : 'reject'} ho gayi.`,
        },
      };
    },
  },

  send_notice: {
    description: 'Prepare a notice for the notice board (to everyone, staff, students, parents or one class); the user confirms.',
    args: '{"message":"notice text","audience":"EVERYONE|STAFF|STUDENTS|PARENTS","className":"10 A optional"}',
    staff: ['announcements.send'],
    run: async ({ tx, ctx }, args) => {
      const message = typeof args.message === 'string' ? args.message.trim().slice(0, 2000) : '';
      if (message.length < 3) return { error: 'Notice mein kya likhna hai? Poora boliye, jaise “class 10 A ke parents ko notice bhejo ki kal school band rahega”.' };
      const branchIds = branchesFor(ctx, ['announcements.send']);
      const branchId = ctx.activeBranchId && branchIds.includes(ctx.activeBranchId) ? ctx.activeBranchId : branchIds[0];
      const className = str(args.className);
      let audience: { type: string; sectionId?: string }[];
      let to: string;
      if (className) {
        const sections = await sectionIdsFor(tx, [branchId], className);
        if (!sections?.length) return { error: `“${className}” class nahi mili.` };
        audience = sections.map((s) => ({ type: 'SECTION', sectionId: s.id }));
        to = sections.map((s) => `${s.grade.name} ${s.name}`).join(', ');
      } else {
        const type = ['STAFF', 'STUDENTS', 'PARENTS'].includes(String(args.audience)) ? String(args.audience) : 'EVERYONE';
        if (!ctx.access.can('reports.view', branchId)) return { error: 'Teachers sirf apni class ko notice bhej sakte hain — class batayein, jaise “10 A ko notice bhejo ki …”.' };
        audience = [{ type }];
        to = { EVERYONE: 'sabko', STAFF: 'staff ko', STUDENTS: 'students ko', PARENTS: 'parents ko' }[type] ?? 'sabko';
      }
      const title = message.split(/\s+/).slice(0, 8).join(' ').replace(/[.,;:!?]+$/, '');
      return {
        action: {
          method: 'POST', path: '/announcements',
          body: { title: title.charAt(0).toUpperCase() + title.slice(1), body: message.charAt(0).toUpperCase() + message.slice(1), category: 'GENERAL', priority: 'MEDIUM', audience, branchId },
          title: 'Notice bhejein?',
          summary: `${to}: “${message}”`,
          confirm: 'Haan, notice bhejo',
          done: 'Notice board par notice lag gaya.',
        },
      };
    },
  },

  collect_fee: {
    description: 'Prepare recording a fee payment at the counter for a student\'s next unpaid installment (the user confirms).',
    args: '{"name":"student name","method":"CASH|UPI|CHEQUE|CARD"}',
    staff: ['fees.collect'],
    run: async (env, args) => {
      const found = await oneStudent(env, args, 'fees.collect');
      if (!('student' in found)) return found;
      const [account] = await feeAccounts(env.tx, [found.student.id], env.year.id);
      if (!account?.installments.length) return { error: `${found.student.name} ka is saal ka fee plan nahi mila.` };
      const paid = await env.tx.feePayment.groupBy({ by: ['installmentId'], where: { studentId: found.student.id, status: 'SUCCESS', installmentId: { in: account.installments.map((i) => i.id) } }, _sum: { amount: true } });
      const paidOf = (id: string) => money(paid.find((p) => p.installmentId === id)?._sum.amount);
      const next = account.installments.find((i) => paidOf(i.id) < i.amount);
      if (!next) return { error: `${found.student.name} ki is saal ki poori fees jama ho chuki hai.` };
      const method = ['UPI', 'CHEQUE', 'CARD', 'NETBANKING'].includes(String(args.method)) ? String(args.method) : 'CASH';
      const due = next.amount - paidOf(next.id);
      return {
        action: {
          method: 'POST', path: '/fees/payments', body: { studentId: found.student.id, installmentId: next.id, method },
          title: 'Fees jama karein?',
          summary: `${found.student.name} (${found.student.class ?? '-'}) — ${next.name}, ₹${due.toLocaleString('en-IN')} ${method}. Due date ${next.dueDate}; late fee lagi to receipt mein jud jayegi.`,
          confirm: `Haan, ₹${due.toLocaleString('en-IN')} jama karo`,
          done: `${found.student.name} ki ${next.name} jama ho gayi — receipt Fees page par hai.`,
        },
      };
    },
  },
};

/** Tools this user may call (by permission), for the model's menu. */
export async function availableTools(tx: Tx, ctx: RequestContext) {
  const isSelf = (await ownStudentIds(tx, ctx)).length > 0;
  return Object.entries(TOOLS)
    .filter(([, tool]) => tool.staff.some((p) => branchesFor(ctx, [p]).length > 0) || (tool.self && isSelf) || (tool.everyone && (isSelf || ctx.access.branchesWith().length > 0)))
    .map(([name]) => name);
}

/** Tools the user holds as staff (not just for their own children) — only those need "which student?". */
export function staffTools(ctx: RequestContext) {
  return Object.entries(TOOLS).filter(([, tool]) => tool.staff.some((p) => branchesFor(ctx, [p]).length > 0)).map(([name]) => name);
}

/** Runs a tool for this user. Unknown or not-allowed tools return an error object, never throw. */
export async function runTool(tx: Tx, ctx: RequestContext, name: string, args: Args, allowed: string[]) {
  const tool = TOOLS[name];
  if (!tool || !allowed.includes(name)) return { error: 'Yeh jaankari aapke role ke liye available nahi hai.' };
  const year = await currentYear(tx);
  return tool.run({ tx, ctx, year }, args);
}
