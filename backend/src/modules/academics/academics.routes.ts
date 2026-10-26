import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, forPatch, idParam, toDateString } from '../../lib/http.js';
import { memberBranches, readScope } from '../../lib/scope.js';
import { ctxOf } from '../../middleware/authenticate.js';

/**
 * Academics: subjects, timetable, attendance, exams & marks, assignments, study notes.
 *
 * Reads follow one rule: staff see the branches where they hold the read permission (the
 * X-Branch-Id branch when sent); a student or parent sees only their own / their children's
 * records. Writes need the write permission in the branch the record belongs to.
 */
export const academicsRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const num = (d: unknown) => (d == null ? null : Number(d));

async function sectionOrThrow(tx: Tx, sectionId: string) {
  const s = await tx.section.findUnique({ where: { id: sectionId }, select: { id: true, branchId: true, name: true, grade: { select: { name: true } } } });
  if (!s) throw notFound('Section');
  return s;
}

/** The signed-in user's staff record (teachers creating coursework). */
async function ownStaffId(tx: Tx, ctx: RequestContext) {
  return (await tx.staff.findFirst({ where: { userId: ctx.userId }, select: { id: true } }))?.id ?? null;
}

async function assertSubject(tx: Tx, subjectId: string) {
  if (!(await tx.subject.count({ where: { id: subjectId } }))) throw badRequest('Unknown subject.');
}

// ═════════════════════════════════════════════════════════════════════════════
// Subjects
// ═════════════════════════════════════════════════════════════════════════════

/** GET /subjects — the organization's subject list. */
academicsRouter.get('/subjects', async (req, res) => {
  const ctx = ctxOf(req);
  const rows = await withTenant(ctx.organizationId, (tx) => tx.subject.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }));
  res.json(rows);
});

/** POST /subjects — needs classes.manage somewhere. */
academicsRouter.post('/subjects', async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere('classes.manage')) throw forbidden();
  const body = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,20}$/), name: z.string().trim().min(1).max(100) }).parse(req.body);
  const row = await withTenant(ctx.organizationId, async (tx) => {
    if (await tx.subject.count({ where: { OR: [{ code: body.code }, { name: body.name }] } })) throw badRequest('A subject with this code or name already exists.');
    const created = await tx.subject.create({ data: { organizationId: ctx.organizationId, ...body } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Subject', entityId: created.id, after: body });
    return created;
  });
  res.status(201).json(row);
});

// ═════════════════════════════════════════════════════════════════════════════
// Timetable
// ═════════════════════════════════════════════════════════════════════════════

/** GET /timetable?sectionId= — weekly periods of every section in the branch (students: their own section). */
academicsRouter.get('/timetable', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ sectionId: uuid.optional() }).parse(req.query);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    let sectionFilter: { in: string[] } | string | undefined = q.sectionId;
    let branchIds: string[];
    const isSelf = ctx.access.branchesWith('self.view').length > 0 && ctx.access.branchesWith('students.read').length === 0;
    if (isSelf) {
      const scope = await readScope(tx, ctx, 'students.read', year.id);
      branchIds = scope.branchIds;
      if (scope.kind === 'self') sectionFilter = { in: q.sectionId ? scope.sectionIds.filter((s) => s === q.sectionId) : scope.sectionIds };
    } else branchIds = memberBranches(ctx);

    const periods = await tx.timetablePeriod.findMany({
      where: { branchId: { in: branchIds }, sectionSubject: { academicYearId: year.id, ...(sectionFilter ? { sectionId: sectionFilter } : {}) } },
      select: {
        id: true, dayOfWeek: true, periodNo: true, startTime: true, endTime: true,
        sectionSubject: {
          select: {
            sectionId: true, teacherId: true,
            subject: { select: { id: true, code: true, name: true } },
            section: { select: { name: true, room: true, grade: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
    });
    const teacherIds = [...new Set(periods.map((p) => p.sectionSubject.teacherId).filter((x): x is string => !!x))];
    const teachers = new Map((await tx.staff.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true, employeeCode: true } })).map((t) => [t.id, t]));
    return periods.map((p) => {
      const t = p.sectionSubject.teacherId ? teachers.get(p.sectionSubject.teacherId) : undefined;
      return {
        id: p.id, sectionId: p.sectionSubject.sectionId, grade: p.sectionSubject.section.grade.name, section: p.sectionSubject.section.name, room: p.sectionSubject.section.room,
        dayOfWeek: p.dayOfWeek, periodNo: p.periodNo, startTime: p.startTime, endTime: p.endTime,
        subjectId: p.sectionSubject.subject.id, subjectCode: p.sectionSubject.subject.code, subjectName: p.sectionSubject.subject.name,
        teacherId: t?.id ?? null, teacherName: t?.name ?? null, teacherCode: t?.employeeCode ?? null,
      };
    });
  });
  res.json(rows);
});

/** PUT /timetable/sections/:id — replaces one section's weekly timetable. Needs classes.manage. */
academicsRouter.put('/timetable/sections/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const sectionId = idParam(req);
  const body = z.object({
    periods: z.array(z.object({
      dayOfWeek: z.number().int().min(1).max(7), periodNo: z.number().int().min(1).max(15),
      startTime: time, endTime: time, subjectId: uuid, teacherId: uuid.nullable().optional(),
    })).max(120),
  }).parse(req.body);
  const seen = new Set<string>();
  for (const p of body.periods) {
    const k = `${p.dayOfWeek}|${p.periodNo}`;
    if (seen.has(k)) throw badRequest(`Day ${p.dayOfWeek} period ${p.periodNo} is listed twice.`);
    seen.add(k);
    if (p.endTime <= p.startTime) throw badRequest('A period must end after it starts.');
  }

  const count = await withTenant(ctx.organizationId, async (tx) => {
    const section = await sectionOrThrow(tx, sectionId);
    if (!ctx.access.can('classes.manage', section.branchId)) throw forbidden();
    const year = await currentYear(tx);

    // A teacher cannot be in two sections at the same time. Only new or changed periods are checked,
    // so a clash that is already on file does not block saving the rest of the timetable.
    const current = await tx.timetablePeriod.findMany({ where: { sectionSubject: { academicYearId: year.id, sectionId } }, select: { dayOfWeek: true, periodNo: true, sectionSubject: { select: { subjectId: true, teacherId: true } } } });
    const unchanged = new Set(current.map((c) => `${c.dayOfWeek}|${c.periodNo}|${c.sectionSubject.subjectId}|${c.sectionSubject.teacherId}`));
    const changed = body.periods.filter((p) => !unchanged.has(`${p.dayOfWeek}|${p.periodNo}|${p.subjectId}|${p.teacherId ?? null}`));
    const teacherIds = [...new Set(changed.map((p) => p.teacherId).filter((x): x is string => !!x))];
    if (teacherIds.length) {
      const busy = await tx.timetablePeriod.findMany({
        where: { sectionSubject: { academicYearId: year.id, teacherId: { in: teacherIds }, sectionId: { not: sectionId } } },
        select: { dayOfWeek: true, periodNo: true, sectionSubject: { select: { teacherId: true } } },
      });
      const clash = changed.find((p) => p.teacherId && busy.some((b) => b.dayOfWeek === p.dayOfWeek && b.periodNo === p.periodNo && b.sectionSubject.teacherId === p.teacherId));
      if (clash) throw badRequest(`The teacher for day ${clash.dayOfWeek} period ${clash.periodNo} already teaches another class then.`);
    }

    const existing = await tx.sectionSubject.findMany({ where: { academicYearId: year.id, sectionId } });
    await tx.timetablePeriod.deleteMany({ where: { sectionSubjectId: { in: existing.map((e) => e.id) } } });
    const bySubject = new Map(existing.map((e) => [e.subjectId, e]));
    for (const p of body.periods) {
      let ss = bySubject.get(p.subjectId);
      if (!ss) {
        await assertSubject(tx, p.subjectId);
        ss = await tx.sectionSubject.create({ data: { organizationId: ctx.organizationId, branchId: section.branchId, academicYearId: year.id, sectionId, subjectId: p.subjectId, teacherId: p.teacherId ?? null } });
        bySubject.set(p.subjectId, ss);
      } else if (p.teacherId !== undefined && ss.teacherId !== p.teacherId) {
        ss = await tx.sectionSubject.update({ where: { id: ss.id }, data: { teacherId: p.teacherId } });
        bySubject.set(p.subjectId, ss);
      }
      await tx.timetablePeriod.create({ data: { organizationId: ctx.organizationId, branchId: section.branchId, sectionSubjectId: ss.id, dayOfWeek: p.dayOfWeek, periodNo: p.periodNo, startTime: p.startTime, endTime: p.endTime } });
    }
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Timetable', entityId: sectionId, branchId: section.branchId, after: { periods: body.periods.length } });
    return body.periods.length;
  });
  res.json({ sectionId, periods: count });
});

// ═════════════════════════════════════════════════════════════════════════════
// Attendance
// ═════════════════════════════════════════════════════════════════════════════

const ATTENDANCE = ['PRESENT', 'ABSENT', 'LEAVE', 'LATE'] as const;

/** GET /attendance?from=&to=&sectionId= — registers with their entries (default: the last 120 days). */
academicsRouter.get('/attendance', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ from: dateOnly.optional(), to: dateOnly.optional(), sectionId: uuid.optional() }).parse(req.query);
  const to = q.to ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const from = q.from ?? new Date(to.getTime() - 120 * 86_400_000);

  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const scope = await readScope(tx, ctx, 'attendance.read', year.id);
    const sectionIds = scope.kind === 'self' ? scope.sectionIds.filter((s) => !q.sectionId || s === q.sectionId) : q.sectionId ? [q.sectionId] : undefined;
    const sessions = await tx.attendanceSession.findMany({
      where: { branchId: { in: scope.branchIds }, date: { gte: from, lte: to }, ...(sectionIds ? { sectionId: { in: sectionIds } } : {}) },
      select: {
        id: true, sectionId: true, date: true, periodNo: true, subjectId: true, takenById: true,
        entries: { select: { studentId: true, status: true }, ...(scope.kind === 'self' ? { where: { studentId: { in: scope.studentIds } } } : {}) },
      },
      orderBy: [{ date: 'asc' }, { periodNo: 'asc' }],
    });
    return sessions.map((s) => ({ ...s, date: toDateString(s.date) }));
  });
  res.json(rows);
});

/** PUT /attendance — saves one register (section + date + period). Needs attendance.write in the section's branch. */
academicsRouter.put('/attendance', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    sectionId: uuid,
    date: dateOnly,
    periodNo: z.number().int().min(1).max(15).nullable().default(null),
    subjectId: uuid.nullable().optional(),
    entries: z.array(z.object({ studentId: uuid, status: z.string().toUpperCase().pipe(z.enum(ATTENDANCE)) })).min(1).max(200),
  }).parse(req.body);
  if (body.date.getTime() > Date.now() + 86_400_000) throw badRequest('Attendance cannot be taken for a future date.');

  const saved = await withTenant(ctx.organizationId, async (tx) => {
    const section = await sectionOrThrow(tx, body.sectionId);
    if (!ctx.access.can('attendance.write', section.branchId)) throw forbidden();
    const year = await currentYear(tx);
    if (body.subjectId) await assertSubject(tx, body.subjectId);
    const enrolled = new Set((await tx.enrollment.findMany({ where: { academicYearId: year.id, sectionId: body.sectionId }, select: { studentId: true } })).map((e) => e.studentId));
    const stranger = body.entries.find((e) => !enrolled.has(e.studentId));
    if (stranger) throw badRequest('A student in the list is not in this section.');

    const existing = await tx.attendanceSession.findFirst({ where: { sectionId: body.sectionId, date: body.date, periodNo: body.periodNo } });
    const session = existing
      ? await tx.attendanceSession.update({ where: { id: existing.id }, data: { subjectId: body.subjectId ?? existing.subjectId, takenById: ctx.userId } })
      : await tx.attendanceSession.create({ data: { organizationId: ctx.organizationId, branchId: section.branchId, sectionId: body.sectionId, date: body.date, periodNo: body.periodNo, subjectId: body.subjectId ?? null, takenById: ctx.userId } });
    await tx.attendanceEntry.deleteMany({ where: { sessionId: session.id } });
    const unique = new Map(body.entries.map((e) => [e.studentId, e.status]));
    await tx.attendanceEntry.createMany({ data: [...unique].map(([studentId, status]) => ({ organizationId: ctx.organizationId, sessionId: session.id, studentId, status })) });
    await audit(tx, ctx, { action: existing ? 'UPDATE' : 'CREATE', entity: 'AttendanceSession', entityId: session.id, branchId: section.branchId, after: { date: toDateString(body.date), periodNo: body.periodNo, entries: unique.size } });
    return { id: session.id, sectionId: session.sectionId, date: toDateString(session.date), periodNo: session.periodNo, subjectId: session.subjectId, entries: [...unique].map(([studentId, status]) => ({ studentId, status })) };
  });
  res.json(saved);
});

// ═════════════════════════════════════════════════════════════════════════════
// Exams & marks
// ═════════════════════════════════════════════════════════════════════════════

const paperInput = z.object({
  subjectId: uuid, date: dateOnly, startTime: time, endTime: time,
  maxMarks: z.number().positive().max(1000).default(100), passMarks: z.number().min(0).max(1000).default(33),
});
const examInput = z.object({
  name: z.string().trim().min(1).max(60),
  gradeNames: z.array(z.string().trim().min(1).max(30)).min(1).max(20),
  papers: z.array(paperInput).max(30).default([]),
  resultsPublished: z.boolean().default(false),
  branchId: uuid.nullable().optional(),
});

const examSelect = {
  id: true, branchId: true, name: true, gradeNames: true, resultsPublished: true, publishedAt: true,
  papers: { select: { id: true, subjectId: true, date: true, startTime: true, endTime: true, maxMarks: true, passMarks: true }, orderBy: { date: 'asc' } },
} as const;

type ExamRow = { id: string; branchId: string | null; name: string; gradeNames: string; resultsPublished: boolean; publishedAt: Date | null; papers: { id: string; subjectId: string; date: Date; startTime: string; endTime: string; maxMarks: unknown; passMarks: unknown }[] };
const examOut = (e: ExamRow, subjects: Map<string, string>) => ({
  id: e.id, branchId: e.branchId, name: e.name, gradeNames: e.gradeNames.split(',').filter(Boolean), resultsPublished: e.resultsPublished, publishedAt: e.publishedAt,
  papers: e.papers.map((p) => ({ id: p.id, subjectId: p.subjectId, subjectName: subjects.get(p.subjectId) ?? '', date: toDateString(p.date), startTime: p.startTime, endTime: p.endTime, maxMarks: num(p.maxMarks), passMarks: num(p.passMarks) })),
});
const subjectNames = async (tx: Tx) => new Map((await tx.subject.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));

function checkPapers(papers: z.infer<typeof paperInput>[]) {
  const subjects = new Set<string>();
  for (const p of papers) {
    if (subjects.has(p.subjectId)) throw badRequest('A subject appears twice in the exam schedule.');
    subjects.add(p.subjectId);
    if (p.endTime <= p.startTime) throw badRequest('A paper must end after it starts.');
    if (p.passMarks > p.maxMarks) throw badRequest('Pass marks cannot exceed maximum marks.');
  }
}

/** GET /exams — this year's exams for the branch (including organization-wide exams). */
academicsRouter.get('/exams', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = memberBranches(ctx);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const exams = await tx.exam.findMany({ where: { academicYearId: year.id, OR: [{ branchId: { in: branchIds } }, { branchId: null }] }, select: examSelect, orderBy: { name: 'asc' } });
    const subjects = await subjectNames(tx);
    return exams.map((e) => examOut(e, subjects)).sort((a, b) => (a.papers[0]?.date ?? '9').localeCompare(b.papers[0]?.date ?? '9'));
  });
  res.json(rows);
});

/** Exam permission: an organization-wide exam needs it at org level, a branch exam in that branch. */
const canExam = (ctx: RequestContext, permission: string, branchId: string | null) => (branchId ? ctx.access.can(permission, branchId) : ctx.access.can(permission));

/** POST /exams — needs exams.manage (branch exams use the X-Branch-Id branch). */
academicsRouter.post('/exams', async (req, res) => {
  const ctx = ctxOf(req);
  const body = examInput.parse(req.body);
  checkPapers(body.papers);
  const branchId = body.branchId === null ? null : (body.branchId ?? ctx.activeBranchId ?? ctx.access.branchesWith('exams.manage')[0] ?? null);
  if (!canExam(ctx, 'exams.manage', branchId)) throw forbidden();
  if (body.resultsPublished && !canExam(ctx, 'exams.publish', branchId)) throw forbidden('You may not publish results.');

  const exam = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    for (const p of body.papers) await assertSubject(tx, p.subjectId);
    if (await tx.exam.count({ where: { academicYearId: year.id, branchId, name: body.name } })) throw badRequest(`An exam named “${body.name}” already exists this year.`);
    const created = await tx.exam.create({
      data: {
        organizationId: ctx.organizationId, branchId, academicYearId: year.id, name: body.name, gradeNames: body.gradeNames.join(','),
        resultsPublished: body.resultsPublished, publishedAt: body.resultsPublished ? new Date() : null,
        papers: { create: body.papers.map((p) => ({ organizationId: ctx.organizationId, ...p })) },
      },
      select: examSelect,
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Exam', entityId: created.id, branchId, after: body });
    return examOut(created, await subjectNames(tx));
  });
  res.status(201).json(exam);
});

/**
 * PATCH /exams/:id — schedule changes need exams.manage; publishing results needs exams.publish.
 * `papers`, when sent, replaces the schedule: papers that already have marks can be moved but not dropped.
 */
academicsRouter.patch('/exams/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = forPatch(examInput.omit({ branchId: true })).parse(req.body);
  if (body.papers) checkPapers(body.papers);

  const exam = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.exam.findUnique({ where: { id }, select: examSelect });
    if (!before) throw notFound('Exam');
    const scheduleChange = body.name !== undefined || body.gradeNames !== undefined || body.papers !== undefined;
    if (scheduleChange && !canExam(ctx, 'exams.manage', before.branchId)) throw forbidden();
    if (body.resultsPublished !== undefined && body.resultsPublished !== before.resultsPublished && !canExam(ctx, 'exams.publish', before.branchId)) throw forbidden('You may not publish results.');

    if (body.papers) {
      const keep = new Map(body.papers.map((p) => [p.subjectId, p]));
      for (const old of before.papers) {
        const next = keep.get(old.subjectId);
        if (next) {
          await tx.examPaper.update({ where: { id: old.id }, data: next });
          keep.delete(old.subjectId);
        } else {
          if (await tx.mark.count({ where: { examPaperId: old.id } })) throw badRequest(`${(await subjectNames(tx)).get(old.subjectId)} already has marks — it cannot be removed from the exam.`);
          await tx.examPaper.delete({ where: { id: old.id } });
        }
      }
      for (const p of keep.values()) {
        await assertSubject(tx, p.subjectId);
        await tx.examPaper.create({ data: { organizationId: ctx.organizationId, examId: id, ...p } });
      }
    }
    const updated = await tx.exam.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.gradeNames !== undefined ? { gradeNames: body.gradeNames.join(',') } : {}),
        ...(body.resultsPublished !== undefined ? { resultsPublished: body.resultsPublished, publishedAt: body.resultsPublished ? (before.publishedAt ?? new Date()) : null } : {}),
      },
      select: examSelect,
    });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Exam', entityId: id, branchId: before.branchId, before: { name: before.name, resultsPublished: before.resultsPublished }, after: body });
    return examOut(updated, await subjectNames(tx));
  });
  res.json(exam);
});

/** DELETE /exams/:id — only an exam with no marks entered. Needs exams.manage. */
academicsRouter.delete('/exams/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const exam = await tx.exam.findUnique({ where: { id }, select: { id: true, branchId: true, name: true } });
    if (!exam) throw notFound('Exam');
    if (!canExam(ctx, 'exams.manage', exam.branchId)) throw forbidden();
    if (await tx.mark.count({ where: { examPaper: { examId: id } } })) throw badRequest('Marks have been entered for this exam — it cannot be deleted.');
    await tx.examPaper.deleteMany({ where: { examId: id } });
    await tx.exam.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Exam', entityId: id, branchId: exam.branchId, before: exam });
  });
  res.status(204).end();
});

/** GET /marks?examId=&sectionId= — marks in scope. Students and parents see only published results. */
academicsRouter.get('/marks', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ examId: uuid.optional(), sectionId: uuid.optional() }).parse(req.query);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const scope = await readScope(tx, ctx, 'marks.read', year.id);
    let studentFilter: string[] | undefined = scope.kind === 'self' ? scope.studentIds : undefined;
    if (q.sectionId) {
      const inSection = (await tx.enrollment.findMany({ where: { academicYearId: year.id, sectionId: q.sectionId }, select: { studentId: true } })).map((e) => e.studentId);
      studentFilter = studentFilter ? studentFilter.filter((s) => inSection.includes(s)) : inSection;
    }
    const marks = await tx.mark.findMany({
      where: {
        branchId: { in: scope.branchIds },
        ...(studentFilter ? { studentId: { in: studentFilter } } : {}),
        examPaper: { exam: { academicYearId: year.id, ...(q.examId ? { id: q.examId } : {}), ...(scope.kind === 'self' ? { resultsPublished: true } : {}) } },
      },
      select: { studentId: true, marks: true, isAbsent: true, examPaper: { select: { id: true, examId: true, subjectId: true, maxMarks: true } } },
    });
    return marks.map((m) => ({ examId: m.examPaper.examId, examPaperId: m.examPaper.id, subjectId: m.examPaper.subjectId, studentId: m.studentId, marks: num(m.marks), isAbsent: m.isAbsent, maxMarks: num(m.examPaper.maxMarks) }));
  });
  res.json(rows);
});

/**
 * GET /marks/ranks — for students and parents: their place in the class for each published exam,
 * overall and per subject, without revealing classmates' marks. Staff compute ranks from GET /marks.
 */
academicsRouter.get('/marks/ranks', async (req, res) => {
  const ctx = ctxOf(req);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const scope = await readScope(tx, ctx, 'marks.read', year.id);
    if (scope.kind === 'staff') return [];
    const out: { studentId: string; examId: string; subjectId: string | null; rank: number; outOf: number }[] = [];
    for (const sectionId of scope.sectionIds) {
      const classmates = (await tx.enrollment.findMany({ where: { academicYearId: year.id, sectionId }, select: { studentId: true } })).map((e) => e.studentId);
      const marks = await tx.mark.findMany({
        where: { studentId: { in: classmates }, examPaper: { exam: { academicYearId: year.id, resultsPublished: true } } },
        select: { studentId: true, marks: true, examPaper: { select: { examId: true, subjectId: true } } },
      });
      const scores = new Map<string, Map<string, number>>(); // "exam|subject" (subject "" = overall) -> student -> score
      for (const m of marks) {
        const v = Number(m.marks ?? 0);
        for (const key of [`${m.examPaper.examId}|${m.examPaper.subjectId}`, `${m.examPaper.examId}|`]) {
          const byStudent = scores.get(key) ?? new Map<string, number>();
          byStudent.set(m.studentId, (byStudent.get(m.studentId) ?? 0) + v);
          scores.set(key, byStudent);
        }
      }
      for (const [key, byStudent] of scores) {
        const [examId, subjectId] = key.split('|');
        for (const studentId of scope.studentIds) {
          const mine = byStudent.get(studentId);
          if (mine === undefined) continue;
          out.push({ studentId, examId, subjectId: subjectId || null, rank: [...byStudent.values()].filter((x) => x > mine).length + 1, outOf: byStudent.size });
        }
      }
    }
    return out;
  });
  res.json(rows);
});

/**
 * PUT /marks — enters marks for one exam + subject. Needs marks.write in each student's branch.
 * The exam paper is created (with the exam's first paper date) if the schedule did not list the subject.
 * `marks: null` without `isAbsent` clears a mark.
 */
academicsRouter.put('/marks', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    examId: uuid, subjectId: uuid,
    entries: z.array(z.object({ studentId: uuid, marks: z.number().min(0).max(1000).nullable(), isAbsent: z.boolean().default(false) })).min(1).max(500),
  }).parse(req.body);

  const result = await withTenant(ctx.organizationId, async (tx) => {
    const exam = await tx.exam.findUnique({ where: { id: body.examId }, select: { id: true, branchId: true, papers: { select: { id: true, subjectId: true, date: true, maxMarks: true }, orderBy: { date: 'asc' } } } });
    if (!exam) throw notFound('Exam');
    await assertSubject(tx, body.subjectId);
    const students = await tx.student.findMany({ where: { id: { in: body.entries.map((e) => e.studentId) } }, select: { id: true, branchId: true } });
    const branchOf = new Map(students.map((s) => [s.id, s.branchId]));
    for (const e of body.entries) {
      const b = branchOf.get(e.studentId);
      if (!b) throw badRequest('Unknown student in the list.');
      if (!ctx.access.can('marks.write', b)) throw forbidden();
    }

    let paper = exam.papers.find((p) => p.subjectId === body.subjectId);
    if (!paper) {
      const date = exam.papers[0]?.date ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      paper = await tx.examPaper.create({ data: { organizationId: ctx.organizationId, examId: exam.id, subjectId: body.subjectId, date, startTime: '09:30', endTime: '12:30', maxMarks: 100, passMarks: 33 }, select: { id: true, subjectId: true, date: true, maxMarks: true } });
    }
    const max = Number(paper.maxMarks);
    let saved = 0, cleared = 0;
    for (const e of body.entries) {
      if (e.marks !== null && e.marks > max) throw badRequest(`Marks cannot be more than ${max}.`);
      const key = { examPaperId_studentId: { examPaperId: paper.id, studentId: e.studentId } };
      if (e.marks === null && !e.isAbsent) {
        cleared += (await tx.mark.deleteMany({ where: { examPaperId: paper.id, studentId: e.studentId } })).count;
        continue;
      }
      const data = { marks: e.isAbsent ? null : e.marks, isAbsent: e.isAbsent, enteredById: ctx.userId };
      await tx.mark.upsert({ where: key, update: data, create: { organizationId: ctx.organizationId, branchId: branchOf.get(e.studentId)!, examPaperId: paper.id, studentId: e.studentId, ...data } });
      saved++;
    }
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Mark', entityId: paper.id, branchId: exam.branchId, after: { subjectId: body.subjectId, saved, cleared } });
    return { examPaperId: paper.id, saved, cleared };
  });
  res.json(result);
});

// ═════════════════════════════════════════════════════════════════════════════
// Assignments & study notes
// ═════════════════════════════════════════════════════════════════════════════

/** Files: the database keeps metadata; the bytes go to blob storage once it is configured. */
const fileInput = z.object({ fileName: z.string().trim().min(1).max(260), sizeBytes: z.number().int().min(0).max(50 * 1024 * 1024).default(0), mimeType: z.string().trim().max(100).default('application/octet-stream') });

async function createAttachment(tx: Tx, ctx: RequestContext, branchId: string, f: z.infer<typeof fileInput>) {
  const a = await tx.attachment.create({ data: { organizationId: ctx.organizationId, branchId, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, storageKey: `uploads/${branchId}/${Date.now()}-${f.fileName.replace(/[^\w.-]+/g, '_')}`, uploadedById: ctx.userId } });
  return a.id;
}

/** Staff and attachment names for a list of rows. */
async function names(tx: Tx, staffIds: string[], fileIds: string[]) {
  const [staff, files] = await Promise.all([
    tx.staff.findMany({ where: { id: { in: [...new Set(staffIds)] } }, select: { id: true, name: true } }),
    tx.attachment.findMany({ where: { id: { in: [...new Set(fileIds)] } }, select: { id: true, fileName: true, sizeBytes: true, mimeType: true } }),
  ]);
  return { staff: new Map(staff.map((s) => [s.id, s.name])), files: new Map(files.map((f) => [f.id, f])) };
}

/** GET /assignments — staff: the branch's assignments; students / parents: their section's, with only their own submissions. */
academicsRouter.get('/assignments', async (req, res) => {
  const ctx = ctxOf(req);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const scope = await readScope(tx, ctx, 'students.read', year.id);
    const list = await tx.assignment.findMany({
      where: { branchId: { in: scope.branchIds }, ...(scope.kind === 'self' ? { sectionId: { in: scope.sectionIds } } : {}), dueDate: { gte: year.startDate } },
      include: { submissions: scope.kind === 'self' ? { where: { studentId: { in: scope.studentIds } } } : true },
      orderBy: { assignedDate: 'desc' },
    });
    const n = await names(tx, list.map((a) => a.teacherId), list.flatMap((a) => a.submissions.map((s) => s.fileId).filter((x): x is string => !!x)));
    const subjects = await subjectNames(tx);
    return list.map((a) => ({
      id: a.id, sectionId: a.sectionId, subjectId: a.subjectId, subjectName: subjects.get(a.subjectId) ?? '', teacherId: a.teacherId, teacherName: n.staff.get(a.teacherId) ?? '',
      title: a.title, description: a.description, assignedDate: toDateString(a.assignedDate), dueDate: toDateString(a.dueDate), totalMarks: num(a.totalMarks),
      submissions: a.submissions.map((s) => ({ studentId: s.studentId, submittedAt: toDateString(s.submittedAt), fileName: s.fileId ? n.files.get(s.fileId)?.fileName ?? '' : '', marksObtained: num(s.marksObtained), feedback: s.feedback })),
    }));
  });
  res.json(rows);
});

const assignmentInput = z.object({
  sectionId: uuid, subjectId: uuid, teacherId: uuid.optional(),
  title: z.string().trim().min(1).max(200), description: z.string().trim().max(5000).nullable().optional(),
  assignedDate: dateOnly.optional(), dueDate: dateOnly, totalMarks: z.number().min(0).max(1000),
});

/** POST /assignments — needs coursework.write; the teacher defaults to the signed-in staff member. */
academicsRouter.post('/assignments', async (req, res) => {
  const ctx = ctxOf(req);
  const body = assignmentInput.parse(req.body);
  const row = await withTenant(ctx.organizationId, async (tx) => {
    const section = await sectionOrThrow(tx, body.sectionId);
    if (!ctx.access.can('coursework.write', section.branchId)) throw forbidden();
    await assertSubject(tx, body.subjectId);
    const teacherId = body.teacherId ?? (await ownStaffId(tx, ctx));
    if (!teacherId) throw badRequest('Choose the teacher this assignment belongs to.');
    const assignedDate = body.assignedDate ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    if (body.dueDate < assignedDate) throw badRequest('The due date cannot be before the assigned date.');
    const created = await tx.assignment.create({ data: { organizationId: ctx.organizationId, branchId: section.branchId, sectionId: body.sectionId, subjectId: body.subjectId, teacherId, title: body.title, description: body.description ?? null, assignedDate, dueDate: body.dueDate, totalMarks: body.totalMarks } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Assignment', entityId: created.id, branchId: section.branchId, after: { title: body.title } });
    return { id: created.id };
  });
  res.status(201).json(row);
});

/** DELETE /assignments/:id — removes it with its submissions. Needs coursework.write. */
academicsRouter.delete('/assignments/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const a = await tx.assignment.findUnique({ where: { id } });
    if (!a) throw notFound('Assignment');
    if (!ctx.access.can('coursework.write', a.branchId)) throw forbidden();
    await tx.assignmentSubmission.deleteMany({ where: { assignmentId: id } });
    await tx.assignment.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Assignment', entityId: id, branchId: a.branchId, before: { title: a.title } });
  });
  res.status(204).end();
});

/** POST /assignments/:id/submissions — a student (or their parent) hands in work; replaces an earlier submission. */
academicsRouter.post('/assignments/:id/submissions', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = fileInput.extend({ studentId: uuid }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const a = await tx.assignment.findUnique({ where: { id } });
    if (!a) throw notFound('Assignment');
    const year = await currentYear(tx);
    const linked = await tx.student.count({ where: { id: body.studentId, OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] } });
    if (!linked && !ctx.access.can('coursework.write', a.branchId)) throw forbidden();
    if (!(await tx.enrollment.count({ where: { academicYearId: year.id, sectionId: a.sectionId, studentId: body.studentId } }))) throw badRequest('This assignment is not for this student’s class.');
    const prev = await tx.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: body.studentId } } });
    if (prev?.marksObtained != null) throw badRequest('This work has already been graded.');
    const fileId = await createAttachment(tx, ctx, a.branchId, body);
    const data = { submittedAt: new Date(), fileId, marksObtained: null, feedback: null, gradedById: null };
    const s = prev
      ? await tx.assignmentSubmission.update({ where: { id: prev.id }, data })
      : await tx.assignmentSubmission.create({ data: { organizationId: ctx.organizationId, assignmentId: id, studentId: body.studentId, ...data } });
    return { studentId: s.studentId, submittedAt: toDateString(s.submittedAt), fileName: body.fileName };
  });
  res.status(201).json(out);
});

/** PATCH /assignments/:id/submissions/:studentId — grade a submission. Needs coursework.write. */
academicsRouter.patch('/assignments/:id/submissions/:studentId', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const studentId = idParam(req, 'studentId');
  const body = z.object({ marksObtained: z.number().min(0).max(1000), feedback: z.string().trim().max(1000).nullable().optional() }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const a = await tx.assignment.findUnique({ where: { id } });
    if (!a) throw notFound('Assignment');
    if (!ctx.access.can('coursework.write', a.branchId)) throw forbidden();
    if (body.marksObtained > Number(a.totalMarks)) throw badRequest(`Marks cannot be more than ${Number(a.totalMarks)}.`);
    const s = await tx.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId } } });
    if (!s) throw notFound('Submission');
    await tx.assignmentSubmission.update({ where: { id: s.id }, data: { marksObtained: body.marksObtained, feedback: body.feedback ?? null, gradedById: ctx.userId } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'AssignmentSubmission', entityId: s.id, branchId: a.branchId, after: body });
  });
  res.json({ ok: true });
});

/** GET /notes — staff: the branch's notes; students / parents: their section's. */
academicsRouter.get('/notes', async (req, res) => {
  const ctx = ctxOf(req);
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const scope = await readScope(tx, ctx, 'students.read', year.id);
    const list = await tx.studyNote.findMany({
      where: { branchId: { in: scope.branchIds }, ...(scope.kind === 'self' ? { sectionId: { in: scope.sectionIds } } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    const n = await names(tx, list.map((x) => x.uploadedById), list.map((x) => x.fileId));
    const subjects = await subjectNames(tx);
    return list.map((x) => {
      const f = n.files.get(x.fileId);
      return {
        id: x.id, sectionId: x.sectionId, subjectId: x.subjectId, subjectName: subjects.get(x.subjectId) ?? '', title: x.title, description: x.description,
        fileName: f?.fileName ?? '', sizeBytes: f?.sizeBytes ?? 0, mimeType: f?.mimeType ?? '', uploadedById: x.uploadedById, uploadedBy: n.staff.get(x.uploadedById) ?? '',
        downloads: x.downloads, createdAt: toDateString(x.createdAt),
      };
    });
  });
  res.json(rows);
});

/** POST /notes — needs coursework.write; the uploader defaults to the signed-in staff member. */
academicsRouter.post('/notes', async (req, res) => {
  const ctx = ctxOf(req);
  const body = fileInput.extend({ sectionId: uuid, subjectId: uuid, title: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).nullable().optional(), uploadedById: uuid.optional() }).parse(req.body);
  const row = await withTenant(ctx.organizationId, async (tx) => {
    const section = await sectionOrThrow(tx, body.sectionId);
    if (!ctx.access.can('coursework.write', section.branchId)) throw forbidden();
    await assertSubject(tx, body.subjectId);
    const uploadedById = body.uploadedById ?? (await ownStaffId(tx, ctx));
    if (!uploadedById) throw badRequest('Choose the teacher this note belongs to.');
    const fileId = await createAttachment(tx, ctx, section.branchId, body);
    const created = await tx.studyNote.create({ data: { organizationId: ctx.organizationId, branchId: section.branchId, sectionId: body.sectionId, subjectId: body.subjectId, uploadedById, title: body.title, description: body.description ?? null, fileId } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'StudyNote', entityId: created.id, branchId: section.branchId, after: { title: body.title } });
    return { id: created.id };
  });
  res.status(201).json(row);
});

/** DELETE /notes/:id — needs coursework.write. */
academicsRouter.delete('/notes/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const n = await tx.studyNote.findUnique({ where: { id } });
    if (!n) throw notFound('Note');
    if (!ctx.access.can('coursework.write', n.branchId)) throw forbidden();
    await tx.studyNote.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'StudyNote', entityId: id, branchId: n.branchId, before: { title: n.title } });
  });
  res.status(204).end();
});

/** POST /notes/:id/download — counts a download (anyone who can see the note). */
academicsRouter.post('/notes/:id/download', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const downloads = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const n = await tx.studyNote.findUnique({ where: { id } });
    if (!n) throw notFound('Note');
    const scope = await readScope(tx, ctx, 'students.read', year.id);
    if (!scope.branchIds.includes(n.branchId) || (scope.kind === 'self' && !scope.sectionIds.includes(n.sectionId))) throw notFound('Note');
    return (await tx.studyNote.update({ where: { id }, data: { downloads: { increment: 1 } } })).downloads;
  });
  res.json({ downloads });
});
