import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { targetBranch } from '../../auth/access.js';
import { withTenant } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';

/**
 * The school website from the inside:
 *  - the website profile (Organization.settings.website): everyone signed in reads it, org.manage edits it;
 *  - messages and alumni registrations sent from the website: org.manage or frontoffice.manage;
 *  - job openings and applications (Careers): HR — staff.write.
 */
export const websiteRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());

const canHandleWebsiteMail = (ctx: RequestContext) => ctx.access.canAnywhere('org.manage') || ctx.access.canAnywhere('frontoffice.manage');

// ── Website profile ──────────────────────────────────────────────────────────

/** GET /website — the published website profile (null until it is set up). */
websiteRouter.get('/website', async (req, res) => {
  const ctx = ctxOf(req);
  const row = await withTenant(ctx.organizationId, (tx) => tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } }));
  res.json((parseJson(row.settings) as { website?: unknown } | null)?.website ?? null);
});

/** PUT /website — replaces the website profile. Needs org.manage. */
websiteRouter.put('/website', async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.can('org.manage')) throw forbidden();
  const site = z.record(z.unknown()).refine((s) => JSON.stringify(s).length < 200_000, 'The website profile is too large.').parse(req.body);
  if (typeof site.name !== 'string' || !site.name.trim()) throw badRequest('The school name is required.');
  await withTenant(ctx.organizationId, async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } });
    const settings = (parseJson(org.settings) ?? {}) as Record<string, unknown>;
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: JSON.stringify({ ...settings, website: site }) } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Website', entityId: ctx.organizationId, after: { name: site.name } });
  });
  res.json(site);
});

// ── Messages and alumni from the website ─────────────────────────────────────

/** GET /website/messages — contact, grievance and feedback messages, newest first. */
websiteRouter.get('/website/messages', async (req, res) => {
  const ctx = ctxOf(req);
  if (!canHandleWebsiteMail(ctx)) throw forbidden();
  const rows = await withTenant(ctx.organizationId, (tx) => tx.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 }));
  res.json(rows.map((m) => ({ id: m.id, kind: m.kind, name: m.name, phone: m.phone, email: m.email, subject: m.subject, message: m.message, resolved: m.resolved, createdAt: toDateString(m.createdAt) })));
});

/** PATCH /website/messages/:id — mark a message resolved / open again. */
websiteRouter.patch('/website/messages/:id', async (req, res) => {
  const ctx = ctxOf(req);
  if (!canHandleWebsiteMail(ctx)) throw forbidden();
  const id = idParam(req);
  const body = z.object({ resolved: z.boolean() }).parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    if (!(await tx.contactMessage.count({ where: { id } }))) throw notFound('Message');
    await tx.contactMessage.update({ where: { id }, data: body });
  });
  res.json({ ok: true });
});

/** GET /website/alumni — alumni who registered on the website. */
websiteRouter.get('/website/alumni', async (req, res) => {
  const ctx = ctxOf(req);
  if (!canHandleWebsiteMail(ctx)) throw forbidden();
  const rows = await withTenant(ctx.organizationId, (tx) => tx.alumniMember.findMany({ orderBy: { createdAt: 'desc' } }));
  res.json(rows.map((a) => ({ id: a.id, name: a.name, batch: a.batchYear, email: a.email, phone: a.phone, occupation: a.occupation, city: a.city, createdAt: toDateString(a.createdAt) })));
});

// ── Careers: job openings and applications ───────────────────────────────────

const CATEGORIES = ['TEACHING', 'NON_TEACHING', 'ADMINISTRATION', 'SUPPORT'] as const;
const JOB_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'GUEST'] as const;
const APP_STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'] as const;

type JobRow = { id: string; branchId: string; campus: string | null; title: string; department: string; category: string; employmentType: string; vacancies: number; qualification: string; experience: string | null; salary: string | null; description: string; responsibilities: string | null; postedOn: Date; lastDate: Date; isOpen: boolean };
export const jobOut = (j: JobRow) => ({
  id: j.id, branchId: j.branchId, campus: j.campus, title: j.title, department: j.department, category: j.category, employmentType: j.employmentType, vacancies: j.vacancies,
  qualification: j.qualification, experience: j.experience, salary: j.salary, description: j.description, responsibilities: (parseJson(j.responsibilities) as string[] | null) ?? [],
  postedOn: toDateString(j.postedOn), lastDate: toDateString(j.lastDate), isOpen: j.isOpen,
});

const jobInput = z.object({
  title: z.string().trim().min(2).max(150), department: z.string().trim().min(1).max(100), category: z.enum(CATEGORIES), employmentType: z.enum(JOB_TYPES),
  campus: z.string().trim().max(150).nullable().optional(), vacancies: z.number().int().min(1).max(500), qualification: z.string().trim().min(2).max(300),
  experience: z.string().trim().max(200).nullable().optional(), salary: z.string().trim().max(100).nullable().optional(), description: z.string().trim().min(2).max(10_000),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30).default([]), lastDate: dateOnly, isOpen: z.boolean().default(true), branchId: uuid.optional(),
});

/** GET /jobs — every job opening (HR: staff.write anywhere). */
websiteRouter.get('/jobs', async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx.access.canAnywhere('staff.write')) throw forbidden();
  const branches = ctx.access.branchesWith('staff.write');
  const rows = await withTenant(ctx.organizationId, (tx) => tx.jobOpening.findMany({ where: { branchId: { in: branches } }, orderBy: { postedOn: 'desc' } }));
  res.json(rows.map(jobOut));
});

/** POST /jobs — post an opening (shown on the website while open). */
websiteRouter.post('/jobs', async (req, res) => {
  const ctx = ctxOf(req);
  const body = jobInput.parse(req.body);
  const branchId = targetBranch(ctx, 'staff.write', body.branchId);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const { responsibilities, branchId: _b, ...cols } = body;
    const j = await tx.jobOpening.create({ data: { ...cols, organizationId: ctx.organizationId, branchId, responsibilities: JSON.stringify(responsibilities), postedOn: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'JobOpening', entityId: j.id, branchId, after: { title: body.title } });
    return jobOut(j);
  });
  res.status(201).json(out);
});

/** PATCH /jobs/:id — edit, close or reopen an opening. */
websiteRouter.patch('/jobs/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = jobInput.omit({ branchId: true }).partial().parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.jobOpening.findUnique({ where: { id } });
    if (!before) throw notFound('Job opening');
    if (!ctx.access.can('staff.write', before.branchId)) throw forbidden();
    const { responsibilities, ...cols } = body;
    const j = await tx.jobOpening.update({ where: { id }, data: { ...cols, ...(responsibilities ? { responsibilities: JSON.stringify(responsibilities) } : {}) } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'JobOpening', entityId: id, branchId: before.branchId, before: { title: before.title, isOpen: before.isOpen }, after: body });
    return jobOut(j);
  });
  res.json(out);
});

/** GET /job-applications — applications to the branches where the user manages staff. */
websiteRouter.get('/job-applications', async (req, res) => {
  const ctx = ctxOf(req);
  const branches = ctx.access.branchesWith('staff.write');
  if (!branches.length) throw forbidden();
  const rows = await withTenant(ctx.organizationId, async (tx) => {
    const apps = await tx.jobApplication.findMany({ where: { branchId: { in: branches } }, orderBy: { appliedAt: 'desc' } });
    const files = new Map((await tx.attachment.findMany({ where: { id: { in: apps.map((a) => a.resumeFileId).filter((x): x is string => !!x) } }, select: { id: true, fileName: true } })).map((f) => [f.id, f.fileName]));
    return apps.map((a) => ({
      id: a.id, jobId: a.jobOpeningId, name: a.name, email: a.email, phone: a.phone, qualification: a.qualification, experienceYears: a.experienceYears,
      currentEmployer: a.currentEmployer, expectedSalary: a.expectedSalary, coverLetter: a.coverLetter, resumeName: a.resumeFileId ? files.get(a.resumeFileId) ?? null : null,
      status: a.status, interviewDate: toDateString(a.interviewDate), notes: a.notes, appliedAt: toDateString(a.appliedAt),
      source: a.source, screeningScore: a.screeningScore, screeningNotes: a.screeningNotes,
    }));
  });
  res.json(rows);
});

/** PATCH /job-applications/:id — move an application along (status, interview date, notes). */
websiteRouter.patch('/job-applications/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({
    status: z.enum(APP_STATUSES), interviewDate: dateOnly.nullable(), notes: z.string().trim().max(1000).nullable(),
    source: z.string().trim().max(30).nullable(), screeningScore: z.number().int().min(0).max(100).nullable(), screeningNotes: z.string().trim().max(1000).nullable(),
  }).partial().parse(req.body);
  await withTenant(ctx.organizationId, async (tx) => {
    const a = await tx.jobApplication.findUnique({ where: { id } });
    if (!a) throw notFound('Application');
    if (!ctx.access.can('staff.write', a.branchId)) throw forbidden();
    if (body.status === 'INTERVIEW' && !(body.interviewDate ?? a.interviewDate)) throw badRequest('Set the interview date.');
    await tx.jobApplication.update({ where: { id }, data: body });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'JobApplication', entityId: id, branchId: a.branchId, before: { status: a.status }, after: { ...body, interviewDate: toDateString(body.interviewDate ?? null) } });
  });
  res.json({ ok: true });
});
