import { Router } from 'express';
import { z } from 'zod';
import { targetBranch } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { ctcBreakdown, hrSettings } from '../../lib/payroll.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { assertHr, createOnboardingTasks, createStaffLogin, hrBranches, nextDocNo, nextEmployeeCode, todayUtc } from './common.js';

/**
 * Recruitment beyond the website form: candidates HR sources itself, screening, interview rounds,
 * offers with the CTC annexure, and joining — which creates the employee (code, sign-in, payroll,
 * onboarding checklist). Needs staff.write in the branch.
 */
export const recruitmentRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());

async function applicationOrThrow(tx: Tx, id: string) {
  const a = await tx.jobApplication.findUnique({ where: { id } });
  if (!a) throw notFound('Application');
  return a;
}

/** POST /job-applications — a candidate HR found (referral, job portal, walk-in…). */
recruitmentRouter.post('/job-applications', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    jobId: uuid.nullable().optional(), name: z.string().trim().min(2).max(150), email: z.string().trim().email().max(200), phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/),
    qualification: z.string().trim().min(2).max(300), experienceYears: z.number().int().min(0).max(60), currentEmployer: z.string().trim().max(150).nullable().optional(),
    expectedSalary: z.string().trim().max(60).nullable().optional(), source: z.string().trim().min(2).max(30), notes: z.string().trim().max(1000).nullable().optional(),
    branchId: uuid.optional(),
  }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    let branchId = body.branchId ?? null;
    if (body.jobId) {
      const job = await tx.jobOpening.findUnique({ where: { id: body.jobId }, select: { branchId: true } });
      if (!job) throw notFound('Job opening');
      branchId = job.branchId;
    }
    branchId = targetBranch(ctx, 'staff.write', branchId);
    if (await tx.jobApplication.count({ where: { email: body.email, jobOpeningId: body.jobId ?? null, status: { notIn: ['REJECTED'] } } })) throw conflict('This candidate has already applied for this position.');
    const a = await tx.jobApplication.create({
      data: {
        organizationId: ctx.organizationId, branchId, jobOpeningId: body.jobId ?? null, name: body.name, email: body.email, phone: body.phone, qualification: body.qualification,
        experienceYears: body.experienceYears, currentEmployer: body.currentEmployer ?? null, expectedSalary: body.expectedSalary ?? null, source: body.source, notes: body.notes ?? null,
      },
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'JobApplication', entityId: a.id, branchId, after: { name: body.name, source: body.source } });
    return { id: a.id };
  });
  res.status(201).json(out);
});

// ── Interviews ───────────────────────────────────────────────────────────────

const roundOut = (r: { id: string; applicationId: string; roundNo: number; title: string; mode: string; scheduledAt: Date; interviewer: string; rating: number | null; feedback: string | null; result: string }) => ({
  id: r.id, applicationId: r.applicationId, roundNo: r.roundNo, title: r.title, mode: r.mode, scheduledAt: r.scheduledAt.toISOString(), interviewer: r.interviewer, rating: r.rating, feedback: r.feedback, result: r.result,
});

/** GET /interviews?applicationId= — rounds of one application, or every upcoming round of the branch. */
recruitmentRouter.get('/interviews', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ applicationId: uuid.optional() }).parse(req.query);
  const branches = hrBranches(ctx);
  if (!branches.length) throw notFound();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const apps = await tx.jobApplication.findMany({ where: { branchId: { in: branches }, ...(q.applicationId ? { id: q.applicationId } : {}) }, select: { id: true, name: true } });
    const rounds = await tx.interviewRound.findMany({ where: { applicationId: { in: apps.map((a) => a.id) } }, orderBy: [{ scheduledAt: 'asc' }] });
    const names = new Map(apps.map((a) => [a.id, a.name]));
    return rounds.map((r) => ({ ...roundOut(r), candidate: names.get(r.applicationId) ?? '' }));
  });
  res.json(out);
});

/** POST /job-applications/:id/interviews — schedules the next round (moves the application to INTERVIEW). */
recruitmentRouter.post('/job-applications/:id/interviews', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({
    title: z.string().trim().min(2).max(60), mode: z.enum(['IN_PERSON', 'PHONE', 'VIDEO', 'DEMO_CLASS']),
    scheduledAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)), interviewer: z.string().trim().min(2).max(150),
  }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const a = await applicationOrThrow(tx, id);
    assertHr(ctx, a.branchId);
    if (a.status === 'REJECTED' || a.status === 'SELECTED') throw conflict(`This application is ${a.status.toLowerCase()}.`);
    const last = await tx.interviewRound.findFirst({ where: { applicationId: id }, orderBy: { roundNo: 'desc' } });
    if (last && last.result === 'PENDING') throw conflict(`Round ${last.roundNo} has no result yet.`);
    if (last && last.result === 'FAIL') throw conflict('The candidate did not clear the last round.');
    const scheduledAt = new Date(body.scheduledAt);
    const r = await tx.interviewRound.create({ data: { organizationId: ctx.organizationId, applicationId: id, roundNo: (last?.roundNo ?? 0) + 1, title: body.title, mode: body.mode, scheduledAt, interviewer: body.interviewer } });
    await tx.jobApplication.update({ where: { id }, data: { status: 'INTERVIEW', interviewDate: new Date(`${scheduledAt.toISOString().slice(0, 10)}T00:00:00Z`) } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'InterviewRound', entityId: r.id, branchId: a.branchId, after: body });
    return roundOut(r);
  });
  res.status(201).json(out);
});

/** PATCH /interviews/:id — records the result (rating 1–5 and feedback). A failed round rejects the application. */
recruitmentRouter.patch('/interviews/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ result: z.enum(['PASS', 'FAIL', 'ON_HOLD']), rating: z.number().int().min(1).max(5), feedback: z.string().trim().min(2).max(1000) }).parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const r = await tx.interviewRound.findUnique({ where: { id } });
    if (!r) throw notFound('Interview round');
    const a = await applicationOrThrow(tx, r.applicationId);
    assertHr(ctx, a.branchId);
    const updated = await tx.interviewRound.update({ where: { id }, data: body });
    if (body.result === 'FAIL') await tx.jobApplication.update({ where: { id: a.id }, data: { status: 'REJECTED' } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'InterviewRound', entityId: id, branchId: a.branchId, after: body });
    return roundOut(updated);
  });
  res.json(out);
});

// ── Offers ───────────────────────────────────────────────────────────────────

type OfferRow = { id: string; applicationId: string; letterNo: string; designation: string; department: string; staffType: string; employmentType: string; joiningDate: Date; validTill: Date; ctcAnnual: unknown; breakdown: string; status: string; staffId: string | null; createdAt: Date; respondedAt: Date | null };
const offerOut = (o: OfferRow, candidate?: { name: string; email: string; phone: string }) => ({
  id: o.id, applicationId: o.applicationId, letterNo: o.letterNo, designation: o.designation, department: o.department, staffType: o.staffType, employmentType: o.employmentType,
  joiningDate: toDateString(o.joiningDate), validTill: toDateString(o.validTill), ctcAnnual: Number(o.ctcAnnual), breakdown: parseJson(o.breakdown), status: o.status,
  staffId: o.staffId, createdAt: o.createdAt.toISOString(), respondedAt: o.respondedAt?.toISOString() ?? null, candidate: candidate ?? null,
});

/** GET /offers — every offer of the branch with the candidate. */
recruitmentRouter.get('/offers', async (req, res) => {
  const ctx = ctxOf(req);
  const branches = hrBranches(ctx);
  if (!branches.length) throw notFound();
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const offers = await tx.jobOffer.findMany({ where: { branchId: { in: branches } }, orderBy: { createdAt: 'desc' } });
    const apps = new Map((await tx.jobApplication.findMany({ where: { id: { in: offers.map((o) => o.applicationId) } }, select: { id: true, name: true, email: true, phone: true } })).map((a) => [a.id, a]));
    const branch = await tx.branch.findMany({ where: { id: { in: branches } }, select: { id: true, name: true, address: true, city: true } });
    return { branches: branch, offers: offers.map((o) => offerOut(o, apps.get(o.applicationId))) };
  });
  res.json(out);
});

/** POST /job-applications/:id/offer — drafts an offer letter with its CTC annexure. */
recruitmentRouter.post('/job-applications/:id/offer', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({
    designation: z.string().trim().min(2).max(100), department: z.string().trim().min(1).max(100), staffType: z.enum(['TEACHING', 'NON_TEACHING']),
    employmentType: z.enum(['PERMANENT', 'PROBATION', 'CONTRACT', 'PART_TIME', 'GUEST']), joiningDate: dateOnly, validTill: dateOnly,
    ctcAnnual: z.number().min(10000).max(100_000_000), basicPercent: z.number().min(10).max(80).optional(), hraPercentOfBasic: z.number().min(0).max(100).optional(),
  }).parse(req.body);
  if (body.validTill < todayUtc()) throw badRequest('The offer must be valid until today or later.');
  if (body.joiningDate < todayUtc()) throw badRequest('The joining date cannot be in the past.');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const a = await applicationOrThrow(tx, id);
    assertHr(ctx, a.branchId);
    if (a.status === 'REJECTED') throw conflict('This application was rejected.');
    const pendingRound = await tx.interviewRound.count({ where: { applicationId: id, result: { in: ['PENDING', 'FAIL'] } } });
    if (pendingRound) throw conflict('Finish the interview rounds first (every round needs a pass).');
    if (await tx.jobOffer.count({ where: { applicationId: id, status: { in: ['DRAFT', 'SENT', 'ACCEPTED'] } } })) throw conflict('This candidate already has an open offer.');
    const breakdown = ctcBreakdown(body.ctcAnnual, await hrSettings(tx, ctx.organizationId), body);
    const letterNo = await nextDocNo('OFR', (p) => tx.jobOffer.count({ where: { letterNo: { startsWith: p } } }));
    const o = await tx.jobOffer.create({
      data: {
        organizationId: ctx.organizationId, branchId: a.branchId, applicationId: id, letterNo, designation: body.designation, department: body.department,
        staffType: body.staffType, employmentType: body.employmentType, joiningDate: body.joiningDate, validTill: body.validTill, ctcAnnual: breakdown.ctcAnnual,
        breakdown: JSON.stringify(breakdown), createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'JobOffer', entityId: o.id, branchId: a.branchId, after: { letterNo, ctcAnnual: breakdown.ctcAnnual } });
    return offerOut(o, a);
  });
  res.status(201).json(out);
});

/** PATCH /offers/:id — send, record the candidate's answer, or withdraw. */
recruitmentRouter.patch('/offers/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ status: z.enum(['SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']) }).parse(req.body);
  const NEXT: Record<string, string[]> = { DRAFT: ['SENT', 'WITHDRAWN'], SENT: ['ACCEPTED', 'DECLINED', 'WITHDRAWN'], ACCEPTED: ['WITHDRAWN'] };
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const o = await tx.jobOffer.findUnique({ where: { id } });
    if (!o) throw notFound('Offer');
    assertHr(ctx, o.branchId);
    if (!(NEXT[o.status] ?? []).includes(body.status)) throw conflict(`An offer that is ${o.status.toLowerCase()} cannot be marked ${body.status.toLowerCase()}.`);
    if (o.staffId) throw conflict('The candidate has already joined.');
    if (body.status === 'ACCEPTED' && o.validTill < todayUtc()) throw conflict('The offer has expired — make a new one.');
    const updated = await tx.jobOffer.update({ where: { id }, data: { status: body.status, ...(body.status === 'ACCEPTED' || body.status === 'DECLINED' ? { respondedAt: new Date() } : {}) } });
    if (body.status === 'ACCEPTED') await tx.jobApplication.update({ where: { id: o.applicationId }, data: { status: 'SELECTED' } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'JobOffer', entityId: id, branchId: o.branchId, before: { status: o.status }, after: body });
    return offerOut(updated);
  });
  res.json(out);
});

/**
 * POST /offers/:id/join — the candidate joined: creates the employee with the next employee code,
 * the salary structure from the offer (payroll enrolment), an optional sign-in and the onboarding checklist.
 */
recruitmentRouter.post('/offers/:id/join', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ createLogin: z.boolean().default(true), roleCode: z.string().trim().toUpperCase().max(40).optional(), employeeCode: z.string().trim().regex(/^[A-Za-z0-9-]{2,30}$/).optional() }).parse(req.body ?? {});
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const o = await tx.jobOffer.findUnique({ where: { id } });
    if (!o) throw notFound('Offer');
    assertHr(ctx, o.branchId);
    if (o.status !== 'ACCEPTED') throw conflict('Only an accepted offer can be converted into an employee.');
    if (o.staffId) throw conflict('The candidate has already joined.');
    const a = await applicationOrThrow(tx, o.applicationId);
    const employeeCode = body.employeeCode ?? (await nextEmployeeCode(tx, o.staffType));
    if (await tx.staff.count({ where: { employeeCode } })) throw conflict(`Employee code ${employeeCode} is already used.`);
    const roleCode = body.roleCode ?? (o.staffType === 'TEACHING' ? 'TEACHER' : undefined);
    if (body.createLogin && !roleCode) throw badRequest('Choose the role for the sign-in (e.g. LIBRARIAN, ACCOUNTANT).');
    if (body.createLogin && (await tx.user.count({ where: { username: employeeCode } }))) throw conflict(`Username ${employeeCode} is already in use.`);
    const login = body.createLogin ? await createStaffLogin(tx, ctx, { username: employeeCode, name: a.name, email: a.email, phone: a.phone, branchId: o.branchId, roleCode: roleCode! }) : null;
    const b = parseJson(o.breakdown) as { monthly: { basic: number; hra: number; da: number; ta: number; special: number } };
    const staff = await tx.staff.create({
      data: {
        organizationId: ctx.organizationId, branchId: o.branchId, userId: login?.userId ?? null, employeeCode, name: a.name, phone: a.phone, email: a.email,
        staffType: o.staffType, designation: o.designation, department: o.department, employmentType: o.employmentType, joiningDate: o.joiningDate, status: 'ACTIVE',
        basicSalary: b.monthly.basic, allowances: JSON.stringify({ hra: b.monthly.hra, da: b.monthly.da, ta: b.monthly.ta, other: b.monthly.special }),
        compensation: JSON.stringify({ ...b, effectiveFrom: toDateString(o.joiningDate) }), bgvStatus: 'PENDING',
        profile: JSON.stringify({ highestQualification: a.qualification, totalExperience: `${a.experienceYears} years`, previousEmployer: a.currentEmployer, offerLetterNo: o.letterNo }),
      },
    });
    await tx.jobOffer.update({ where: { id }, data: { staffId: staff.id } });
    await createOnboardingTasks(tx, ctx, staff.id, o.staffType, ['offer_signed', 'employee_code', 'payroll', ...(login ? ['login'] : [])]);
    await audit(tx, ctx, { action: 'CREATE', entity: 'Staff', entityId: staff.id, branchId: o.branchId, after: { employeeCode, from: o.letterNo, login: !!login } });
    return { staffId: staff.id, employeeCode, temporaryPassword: login?.temporaryPassword ?? null };
  });
  res.status(201).json(out);
});
