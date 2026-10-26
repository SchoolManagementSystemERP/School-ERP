import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { withSystem, withTenant, type Tx } from '../../db/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { parseJson, toDateString } from '../../lib/http.js';
import { jobOut } from '../website/website.routes.js';

/**
 * Public data and forms for a school's website (no sign-in). The school is named by its
 * subdomain: /public/greenwood/… Only what the school publishes for everyone is returned;
 * form submissions are rate-limited per IP.
 */
export const publicRouter = Router();

const subdomain = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/);

/** The organization behind a website, if it is active. */
export async function publicOrganization(raw: unknown) {
  const parsed = subdomain.safeParse(raw);
  if (!parsed.success) throw notFound('School');
  const org = await withSystem((tx) => tx.organization.findUnique({ where: { subdomain: parsed.data }, select: { id: true, name: true, status: true } }));
  if (!org || org.status === 'SUSPENDED' || org.status === 'CANCELLED') throw notFound('School');
  return org;
}

/** The school's main branch: the one with the most students (where website enquiries go by default). */
export async function mainBranchId(tx: Tx) {
  const branches = await tx.branch.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  if (!branches.length) throw notFound('School');
  const counts = await tx.student.groupBy({ by: ['branchId'], where: { status: 'ACTIVE' }, _count: { _all: true } });
  const size = new Map(counts.map((c) => [c.branchId, c._count._all]));
  return [...branches].sort((a, b) => (size.get(b.id) ?? 0) - (size.get(a.id) ?? 0) || a.name.localeCompare(b.name))[0].id;
}

const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

// ── Read-only pages ──────────────────────────────────────────────────────────

/** GET /public/:org/site — the website profile the school published (Website settings). */
publicRouter.get('/public/:org/site', async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const row = await withTenant(org.id, (tx) => tx.organization.findUniqueOrThrow({ where: { id: org.id }, select: { settings: true } }));
  const site = (parseJson(row.settings) as { website?: unknown } | null)?.website;
  if (!site) throw notFound('Website');
  res.set('Cache-Control', 'public, max-age=60');
  res.json(site);
});

/** GET /public/:org/announcements — notices addressed to everyone, newest first. */
publicRouter.get('/public/:org/announcements', async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const rows = await withTenant(org.id, (tx) =>
    tx.announcement.findMany({
      where: { audiences: { some: { audienceType: 'EVERYONE' } } },
      select: { id: true, title: true, body: true, category: true, priority: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  );
  res.set('Cache-Control', 'public, max-age=60');
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

/** GET /public/:org/exams — this year's exam datesheets that are not over yet. */
publicRouter.get('/public/:org/exams', async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const rows = await withTenant(org.id, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
    if (!year) return [];
    const exams = await tx.exam.findMany({
      where: { academicYearId: year.id, papers: { some: { date: { gte: todayUtc() } } } },
      select: { id: true, name: true, gradeNames: true, papers: { select: { subjectId: true, date: true, startTime: true, endTime: true }, orderBy: { date: 'asc' } } },
    });
    const subjects = new Map((await tx.subject.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    return exams.map((e) => ({
      id: e.id, name: e.name, gradeNames: e.gradeNames.split(',').filter(Boolean),
      papers: e.papers.map((p) => ({ subjectName: subjects.get(p.subjectId) ?? '', date: toDateString(p.date), startTime: p.startTime, endTime: p.endTime })),
    }));
  });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(rows);
});

/** GET /public/:org/fees — annual tuition per class this year (main branch). */
publicRouter.get('/public/:org/fees', async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const rows = await withTenant(org.id, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
    if (!year) return [];
    const plans = await tx.feePlan.findMany({ where: { academicYearId: year.id, branchId: await mainBranchId(tx), feeHead: 'TUITION' }, select: { gradeId: true, annualAmount: true } });
    const grades = new Map((await tx.grade.findMany({ where: { id: { in: plans.map((p) => p.gradeId) } }, select: { id: true, name: true } })).map((g) => [g.id, g.name]));
    return plans.map((p) => ({ grade: grades.get(p.gradeId) ?? '', annualAmount: Number(p.annualAmount) }));
  });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(rows);
});

/** GET /public/:org/faculty — teachers for the Faculty page: name, role and qualifications only (no contact details). */
publicRouter.get('/public/:org/faculty', async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const rows = await withTenant(org.id, (tx) =>
    tx.staff.findMany({ where: { staffType: 'TEACHING', status: 'ACTIVE' }, select: { id: true, name: true, designation: true, department: true, profile: true }, orderBy: { name: 'asc' } }),
  );
  res.set('Cache-Control', 'public, max-age=300');
  res.json(rows.map((s) => {
    const p = (parseJson(s.profile) ?? {}) as Record<string, unknown>;
    return { id: s.id, name: s.name, designation: s.designation, department: s.department, highestQualification: p.highestQualification ?? '', experience: p.experience ?? p.totalExperience ?? '', bEd: p.bEd === true };
  }));
});

/** GET /public/:org/jobs — open positions for the Careers page. */
publicRouter.get('/public/:org/jobs', async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const rows = await withTenant(org.id, (tx) => tx.jobOpening.findMany({ where: { isOpen: true }, orderBy: { postedOn: 'desc' } }));
  res.set('Cache-Control', 'public, max-age=60');
  res.json(rows.map(jobOut));
});

// ── Forms ────────────────────────────────────────────────────────────────────

const formLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many submissions — please try again later.' },
});
const phone = z.string().trim().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number');
const email = z.string().trim().email().max(200);
const optional = (s: z.ZodTypeAny) => s.nullable().optional().or(z.literal('')).transform((v) => (v ? (v as string) : null));

/** POST /public/:org/enquiries — admission enquiry from the website. */
publicRouter.post('/public/:org/enquiries', formLimiter, async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const body = z.object({
    studentName: z.string().trim().min(2).max(150), parentName: z.string().trim().min(2).max(150), phone, email: optional(email),
    grade: z.string().trim().min(1).max(30), notes: optional(z.string().trim().max(1000)),
  }).parse(req.body);
  await withTenant(org.id, async (tx) => {
    await tx.enquiry.create({ data: { organizationId: org.id, branchId: await mainBranchId(tx), studentName: body.studentName, parentName: body.parentName, phone: body.phone, email: body.email, gradeName: body.grade, source: 'Website', status: 'NEW', notes: body.notes } });
  });
  res.status(201).json({ ok: true });
});

/** POST /public/:org/applications — job application (the resume's file name only, until file storage is set up). */
publicRouter.post('/public/:org/applications', formLimiter, async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const body = z.object({
    jobId: z.string().uuid().nullable().optional(), name: z.string().trim().min(2).max(150), email, phone, qualification: z.string().trim().min(2).max(300),
    experienceYears: z.number().int().min(0).max(60), currentEmployer: optional(z.string().trim().max(150)), expectedSalary: optional(z.string().trim().max(60)),
    coverLetter: optional(z.string().trim().max(5000)), resumeName: optional(z.string().trim().max(260)),
  }).parse(req.body);
  await withTenant(org.id, async (tx) => {
    let branchId = await mainBranchId(tx);
    if (body.jobId) {
      const job = await tx.jobOpening.findUnique({ where: { id: body.jobId }, select: { branchId: true, isOpen: true, lastDate: true } });
      if (!job || !job.isOpen || job.lastDate < todayUtc()) throw badRequest('This position is no longer accepting applications.');
      branchId = job.branchId;
    }
    const resume = body.resumeName
      ? await tx.attachment.create({ data: { organizationId: org.id, branchId, fileName: body.resumeName, mimeType: 'application/octet-stream', sizeBytes: 0, storageKey: `applications/${Date.now()}-${body.resumeName.replace(/[^\w.-]+/g, '_')}`, uploadedById: null } })
      : null;
    await tx.jobApplication.create({
      data: {
        organizationId: org.id, branchId, jobOpeningId: body.jobId ?? null, name: body.name, email: body.email, phone: body.phone, qualification: body.qualification,
        experienceYears: body.experienceYears, currentEmployer: body.currentEmployer, expectedSalary: body.expectedSalary, coverLetter: body.coverLetter, resumeFileId: resume?.id ?? null, source: 'Website',
      },
    });
  });
  res.status(201).json({ ok: true });
});

/** POST /public/:org/contact — contact, grievance or feedback message. */
publicRouter.post('/public/:org/contact', formLimiter, async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const body = z.object({
    kind: z.string().toUpperCase().pipe(z.enum(['CONTACT', 'GRIEVANCE', 'FEEDBACK'])), name: z.string().trim().min(2).max(150), phone, email: optional(email),
    subject: z.string().trim().min(2).max(200), message: z.string().trim().min(2).max(5000),
  }).parse(req.body);
  await withTenant(org.id, (tx) => tx.contactMessage.create({ data: { organizationId: org.id, ...body } }));
  res.status(201).json({ ok: true });
});

/** POST /public/:org/alumni — alumni registration (a repeat registration is ignored). */
publicRouter.post('/public/:org/alumni', formLimiter, async (req, res) => {
  const org = await publicOrganization(req.params.org);
  const body = z.object({
    name: z.string().trim().min(2).max(150), batch: z.coerce.number().int().min(1900).max(new Date().getFullYear()), email,
    phone: optional(phone), occupation: optional(z.string().trim().max(150)), city: optional(z.string().trim().max(100)),
  }).parse(req.body);
  await withTenant(org.id, async (tx) => {
    if (await tx.alumniMember.count({ where: { email: body.email, batchYear: body.batch } })) return;
    await tx.alumniMember.create({ data: { organizationId: org.id, name: body.name, batchYear: body.batch, email: body.email, phone: body.phone, occupation: body.occupation, city: body.city } });
  });
  res.status(201).json({ ok: true });
});

/** POST /public/demo-requests — demo request from the SchoolERP product website (not tied to a school). */
publicRouter.post('/public/demo-requests', formLimiter, async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(150), institution: z.string().trim().min(2).max(200), role: optional(z.string().trim().max(60)), phone, email: optional(email),
    city: z.string().trim().min(2).max(100), campuses: optional(z.string().trim().max(20)), students: optional(z.string().trim().max(30)), message: optional(z.string().trim().max(1000)),
  }).parse(req.body);
  await withSystem((tx) => tx.demoLead.create({ data: body }));
  res.status(201).json({ ok: true });
});
