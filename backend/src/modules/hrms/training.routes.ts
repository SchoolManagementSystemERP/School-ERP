import { Router } from 'express';
import { z } from 'zod';
import { targetBranch } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { assertHr, canManageHr, hrBranches, ownStaff, todayUtc } from './common.js';

/**
 * Learning & development: the training calendar, modules with presentation slides, a question bank,
 * trainer and participant enrolment, pre- and post-tests (scored here, so nobody can set their own
 * score), attendance, feedback and the MIS report. HR (staff.write) runs it; staff see their own trainings.
 */
export const trainingRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const num = (d: unknown) => (d == null ? null : Number(d));

type Slide = { title: string; body: string };
type TrainingRow = { id: string; branchId: string; title: string; category: string; description: string | null; trainerName: string; trainerStaffId: string | null; mode: string; venue: string | null; startDate: Date; endDate: Date; durationHours: unknown; slides: string | null; passPercent: number; status: string };
const trainingOut = (t: TrainingRow) => ({
  id: t.id, branchId: t.branchId, title: t.title, category: t.category, description: t.description, trainerName: t.trainerName, trainerStaffId: t.trainerStaffId,
  mode: t.mode, venue: t.venue, startDate: toDateString(t.startDate), endDate: toDateString(t.endDate), durationHours: Number(t.durationHours),
  slides: (parseJson(t.slides) as Slide[] | null) ?? [], passPercent: t.passPercent, status: t.status,
});

async function trainingOrThrow(tx: Tx, id: string) {
  const t = await tx.training.findUnique({ where: { id } });
  if (!t) throw notFound('Training');
  return t;
}

const trainingInput = z.object({
  title: z.string().trim().min(3).max(200), category: z.enum(['INDUCTION', 'SKILL', 'COMPLIANCE', 'SAFETY', 'OTHER']), description: z.string().trim().max(2000).nullable().optional(),
  trainerName: z.string().trim().min(2).max(150), trainerStaffId: uuid.nullable().optional(), mode: z.enum(['CLASSROOM', 'ONLINE']), venue: z.string().trim().max(150).nullable().optional(),
  startDate: dateOnly, endDate: dateOnly, durationHours: z.number().positive().max(500), passPercent: z.number().int().min(0).max(100).default(60),
  slides: z.array(z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().max(5000) })).max(60).default([]),
  status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
  branchId: uuid.optional(),
});

/**
 * GET /trainings — HR: the branch's calendar with enrolment counts; everyone else: the trainings they
 * are enrolled in (or give), with their own scores.
 */
trainingRouter.get('/trainings', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const branches = hrBranches(ctx);
    const me = await ownStaff(tx, ctx);
    if (!branches.length && !me) throw forbidden();
    const mine = me ? await tx.trainingEnrollment.findMany({ where: { staffId: me.id } }) : [];
    const trainings = await tx.training.findMany({
      where: branches.length ? { branchId: { in: branches } } : { OR: [{ id: { in: mine.map((e) => e.trainingId) } }, ...(me ? [{ trainerStaffId: me.id }] : [])] },
      orderBy: { startDate: 'desc' },
    });
    const counts = await tx.trainingEnrollment.groupBy({ by: ['trainingId'], where: { trainingId: { in: trainings.map((t) => t.id) } }, _count: { _all: true } });
    const qCounts = await tx.trainingQuestion.groupBy({ by: ['trainingId'], where: { trainingId: { in: trainings.map((t) => t.id) } }, _count: { _all: true } });
    return trainings.map((t) => {
      const e = mine.find((x) => x.trainingId === t.id);
      return {
        ...trainingOut(t), enrolled: counts.find((c) => c.trainingId === t.id)?._count._all ?? 0, questions: qCounts.find((c) => c.trainingId === t.id)?._count._all ?? 0,
        isTrainer: !!me && t.trainerStaffId === me.id,
        mine: e ? { preScore: num(e.preScore), postScore: num(e.postScore), attended: e.attended, completedAt: e.completedAt?.toISOString() ?? null, rating: e.rating, feedback: e.feedback } : null,
      };
    });
  });
  res.json(out);
});

/** GET /trainings/:id — details; participants and questions (answers only for HR). */
trainingRouter.get('/trainings/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const t = await trainingOrThrow(tx, id);
    const hr = canManageHr(ctx, t.branchId);
    const me = await ownStaff(tx, ctx);
    const enrolled = me ? await tx.trainingEnrollment.findUnique({ where: { trainingId_staffId: { trainingId: id, staffId: me.id } } }) : null;
    if (!hr && !enrolled && t.trainerStaffId !== me?.id) throw notFound('Training');
    const questions = await tx.trainingQuestion.findMany({ where: { trainingId: id }, orderBy: { sortOrder: 'asc' } });
    const enrollments = hr || t.trainerStaffId === me?.id ? await tx.trainingEnrollment.findMany({ where: { trainingId: id } }) : [];
    const staff = new Map((await tx.staff.findMany({ where: { id: { in: enrollments.map((e) => e.staffId) } }, select: { id: true, name: true, employeeCode: true, designation: true } })).map((s) => [s.id, s]));
    return {
      ...trainingOut(t),
      canManage: hr,
      questions: questions.map((q) => ({ id: q.id, question: q.question, options: parseJson(q.options) as string[], ...(hr ? { answerIndex: q.answerIndex } : {}) })),
      participants: enrollments.map((e) => ({
        staffId: e.staffId, name: staff.get(e.staffId)?.name ?? '', employeeCode: staff.get(e.staffId)?.employeeCode ?? '', designation: staff.get(e.staffId)?.designation ?? '',
        preScore: num(e.preScore), postScore: num(e.postScore), attended: e.attended, completedAt: e.completedAt?.toISOString() ?? null, rating: e.rating, feedback: e.feedback,
      })),
      mine: enrolled ? { preScore: num(enrolled.preScore), postScore: num(enrolled.postScore), attended: enrolled.attended, rating: enrolled.rating, feedback: enrolled.feedback } : null,
    };
  });
  res.json(out);
});

/** POST /trainings — plans a training (with its presentation). */
trainingRouter.post('/trainings', async (req, res) => {
  const ctx = ctxOf(req);
  const body = trainingInput.parse(req.body);
  if (body.endDate < body.startDate) throw badRequest('The training cannot end before it starts.');
  const branchId = targetBranch(ctx, 'staff.write', body.branchId);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    if (body.trainerStaffId && !(await tx.staff.count({ where: { id: body.trainerStaffId } }))) throw badRequest('Unknown trainer.');
    const { slides, branchId: _b, ...cols } = body;
    const t = await tx.training.create({ data: { ...cols, organizationId: ctx.organizationId, branchId, slides: JSON.stringify(slides), trainerStaffId: cols.trainerStaffId ?? null } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Training', entityId: t.id, branchId, after: { title: body.title } });
    return trainingOut(t);
  });
  res.status(201).json(out);
});

/** PATCH /trainings/:id — edit details, slides or status. */
trainingRouter.patch('/trainings/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = trainingInput.omit({ branchId: true }).partial().parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const t = await trainingOrThrow(tx, id);
    assertHr(ctx, t.branchId);
    const start = body.startDate ?? t.startDate;
    const end = body.endDate ?? t.endDate;
    if (end < start) throw badRequest('The training cannot end before it starts.');
    const { slides, ...cols } = body;
    const updated = await tx.training.update({ where: { id }, data: { ...cols, ...(slides ? { slides: JSON.stringify(slides) } : {}) } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Training', entityId: id, branchId: t.branchId, after: { ...cols, slides: slides?.length } });
    return trainingOut(updated);
  });
  res.json(out);
});

/** PUT /trainings/:id/questions — replaces the question bank (before anyone has taken a test). */
trainingRouter.put('/trainings/:id/questions', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({
    questions: z.array(z.object({ question: z.string().trim().min(3).max(500), options: z.array(z.string().trim().min(1).max(300)).min(2).max(6), answerIndex: z.number().int().min(0) })).max(100),
  }).parse(req.body);
  for (const [i, q] of body.questions.entries()) if (q.answerIndex >= q.options.length) throw badRequest(`Question ${i + 1}: the correct answer must be one of its options.`);
  await withTenant(ctx.organizationId, async (tx) => {
    const t = await trainingOrThrow(tx, id);
    assertHr(ctx, t.branchId);
    if (await tx.trainingEnrollment.count({ where: { trainingId: id, OR: [{ preScore: { not: null } }, { postScore: { not: null } }] } })) throw conflict('Someone has already taken a test — the questions can no longer change.');
    await tx.trainingQuestion.deleteMany({ where: { trainingId: id } });
    if (body.questions.length) {
      await tx.trainingQuestion.createMany({ data: body.questions.map((q, i) => ({ organizationId: ctx.organizationId, trainingId: id, sortOrder: i + 1, question: q.question, options: JSON.stringify(q.options), answerIndex: q.answerIndex })) });
    }
    await audit(tx, ctx, { action: 'UPDATE', entity: 'TrainingQuestions', entityId: id, branchId: t.branchId, after: { questions: body.questions.length } });
  });
  res.json({ ok: true, questions: body.questions.length });
});

/** POST /trainings/:id/enroll — adds participants; DELETE …/enroll/:staffId removes one (before any test). */
trainingRouter.post('/trainings/:id/enroll', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ staffIds: z.array(uuid).min(1).max(500) }).parse(req.body);
  const added = await withTenant(ctx.organizationId, async (tx) => {
    const t = await trainingOrThrow(tx, id);
    assertHr(ctx, t.branchId);
    if (t.status === 'CANCELLED' || t.status === 'COMPLETED') throw conflict(`This training is ${t.status.toLowerCase()}.`);
    const staff = await tx.staff.findMany({ where: { id: { in: body.staffIds }, status: { not: 'RESIGNED' } }, select: { id: true } });
    if (staff.length !== new Set(body.staffIds).size) throw badRequest('Unknown or former staff member in the list.');
    const already = new Set((await tx.trainingEnrollment.findMany({ where: { trainingId: id }, select: { staffId: true } })).map((e) => e.staffId));
    const fresh = body.staffIds.filter((s) => !already.has(s) && s !== t.trainerStaffId);
    if (fresh.length) await tx.trainingEnrollment.createMany({ data: fresh.map((staffId) => ({ organizationId: ctx.organizationId, trainingId: id, staffId })) });
    return fresh.length;
  });
  res.status(201).json({ added });
});

trainingRouter.delete('/trainings/:id/enroll/:staffId', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const staffId = idParam(req, 'staffId');
  await withTenant(ctx.organizationId, async (tx) => {
    const t = await trainingOrThrow(tx, id);
    assertHr(ctx, t.branchId);
    const e = await tx.trainingEnrollment.findUnique({ where: { trainingId_staffId: { trainingId: id, staffId } } });
    if (!e) throw notFound('Participant');
    if (e.preScore != null || e.postScore != null || e.attended) throw conflict('This participant has already started the training.');
    await tx.trainingEnrollment.delete({ where: { id: e.id } });
  });
  res.status(204).end();
});

/** POST /trainings/:id/attendance — marks who attended (HR or the trainer). */
trainingRouter.post('/trainings/:id/attendance', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ entries: z.array(z.object({ staffId: uuid, attended: z.boolean() })).min(1).max(500) }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const t = await trainingOrThrow(tx, id);
    const me = await ownStaff(tx, ctx);
    if (!canManageHr(ctx, t.branchId) && (!me || t.trainerStaffId !== me.id)) throw forbidden();
    if (t.startDate > todayUtc()) throw badRequest('The training has not started yet.');
    for (const e of body.entries) await tx.trainingEnrollment.updateMany({ where: { trainingId: id, staffId: e.staffId }, data: { attended: e.attended } });
  });
  res.json({ ok: true });
});

/**
 * POST /trainings/:id/test — a participant submits the pre-test (before the training ends) or the
 * post-test (once it has started; only once). Returns the score.
 */
trainingRouter.post('/trainings/:id/test', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ kind: z.enum(['PRE', 'POST']), answers: z.array(z.number().int().min(-1)).max(100) }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const t = await trainingOrThrow(tx, id);
    const me = await ownStaff(tx, ctx);
    if (!me) throw forbidden();
    const e = await tx.trainingEnrollment.findUnique({ where: { trainingId_staffId: { trainingId: id, staffId: me.id } } });
    if (!e) throw forbidden('You are not enrolled in this training.');
    if (t.status === 'CANCELLED') throw conflict('This training was cancelled.');
    const questions = await tx.trainingQuestion.findMany({ where: { trainingId: id }, orderBy: { sortOrder: 'asc' } });
    if (!questions.length) throw conflict('This training has no test.');
    if (body.answers.length !== questions.length) throw badRequest('Answer every question (or skip it).');
    if (body.kind === 'PRE') {
      if (e.preScore != null) throw conflict('You have already taken the pre-test.');
      if (e.postScore != null) throw conflict('The pre-test is closed after the post-test.');
    } else {
      if (e.postScore != null) throw conflict('You have already taken the post-test.');
      if (t.startDate > todayUtc()) throw conflict('The post-test opens when the training starts.');
    }
    const correct = questions.filter((q, i) => body.answers[i] === q.answerIndex).length;
    const score = Math.round((correct / questions.length) * 10000) / 100;
    await tx.trainingEnrollment.update({
      where: { id: e.id },
      data: body.kind === 'PRE' ? { preScore: score } : { postScore: score, completedAt: score >= t.passPercent ? new Date() : null, attended: true },
    });
    if (body.kind === 'POST' && score >= t.passPercent && t.category === 'INDUCTION') {
      await tx.onboardingTask.updateMany({ where: { staffId: me.id, taskKey: 'induction', done: false }, data: { done: true, doneAt: new Date(), note: `${t.title}: ${score}%` } });
    }
    return {
      kind: body.kind, score, correct, total: questions.length, passed: score >= t.passPercent, passPercent: t.passPercent,
      // after the post-test the answers are shown so people can learn from their mistakes
      ...(body.kind === 'POST' ? { answers: questions.map((q) => q.answerIndex) } : {}),
    };
  });
  res.json(out);
});

/** POST /trainings/:id/feedback — a participant rates the training (1–5) after attending. */
trainingRouter.post('/trainings/:id/feedback', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ rating: z.number().int().min(1).max(5), feedback: z.string().trim().max(500).optional() }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const me = await ownStaff(tx, ctx);
    if (!me) throw forbidden();
    const e = await tx.trainingEnrollment.findUnique({ where: { trainingId_staffId: { trainingId: id, staffId: me.id } } });
    if (!e) throw forbidden('You are not enrolled in this training.');
    if (!e.attended) throw conflict('Give feedback after attending the training.');
    await tx.trainingEnrollment.update({ where: { id: e.id }, data: { rating: body.rating, feedback: body.feedback ?? null } });
  });
  res.json({ ok: true });
});

/** GET /trainings-mis?from=&to= — the L&D report: per training and per employee. */
trainingRouter.get('/trainings-mis', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ from: dateOnly.optional(), to: dateOnly.optional() }).parse(req.query);
  const branches = hrBranches(ctx, (b) => ctx.access.can('reports.view', b));
  if (!branches.length) throw forbidden();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const trainings = await tx.training.findMany({
      where: { branchId: { in: branches }, status: { not: 'CANCELLED' }, ...(q.from ? { startDate: { gte: q.from } } : {}), ...(q.to ? { endDate: { lte: q.to } } : {}) },
      orderBy: { startDate: 'asc' },
    });
    const enrollments = await tx.trainingEnrollment.findMany({ where: { trainingId: { in: trainings.map((t) => t.id) } } });
    const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
    const perTraining = trainings.map((t) => {
      const es = enrollments.filter((e) => e.trainingId === t.id);
      const pre = avg(es.map((e) => num(e.preScore)));
      const post = avg(es.map((e) => num(e.postScore)));
      return {
        id: t.id, title: t.title, category: t.category, trainer: t.trainerName, startDate: toDateString(t.startDate), status: t.status, hours: Number(t.durationHours),
        enrolled: es.length, attended: es.filter((e) => e.attended).length, avgPre: pre, avgPost: post, improvement: pre != null && post != null ? Math.round((post - pre) * 10) / 10 : null,
        passed: es.filter((e) => e.postScore != null && Number(e.postScore) >= t.passPercent).length, avgRating: avg(es.map((e) => e.rating)),
      };
    });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(enrollments.map((e) => e.staffId))] } }, select: { id: true, name: true, employeeCode: true, department: true } });
    const perEmployee = staff.map((s) => {
      const es = enrollments.filter((e) => e.staffId === s.id && e.attended);
      return { staffId: s.id, name: s.name, employeeCode: s.employeeCode, department: s.department, trainings: es.length, hours: es.reduce((h, e) => h + Number(trainings.find((t) => t.id === e.trainingId)?.durationHours ?? 0), 0), avgPost: avg(es.map((e) => num(e.postScore))) };
    }).sort((a, b) => b.hours - a.hours);
    return {
      totals: {
        trainings: trainings.length, completed: trainings.filter((t) => t.status === 'COMPLETED').length, participants: new Set(enrollments.map((e) => e.staffId)).size,
        attendance: enrollments.length ? Math.round((enrollments.filter((e) => e.attended).length / enrollments.length) * 100) : 0,
        trainingHours: perEmployee.reduce((h, p) => h + p.hours, 0),
      },
      perTraining, perEmployee,
    };
  });
  res.json(out);
});
