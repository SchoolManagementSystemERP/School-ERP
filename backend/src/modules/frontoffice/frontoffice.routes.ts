import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { targetBranch } from '../../auth/access.js';
import { withTenant } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';

/**
 * Front office: admission enquiries (walk-in, phone, website…) and the visitor log.
 * Reception manages both (frontoffice.manage); principals and admins (reports.view) can read them.
 */
export const frontOfficeRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const ENQUIRY_STATUSES = ['NEW', 'CONTACTED', 'VISIT_SCHEDULED', 'ADMITTED', 'CLOSED'] as const;

function readBranches(ctx: RequestContext) {
  const ok = (b: string) => ctx.access.can('frontoffice.manage', b) || ctx.access.can('reports.view', b);
  const ids = ctx.activeBranchId ? (ok(ctx.activeBranchId) ? [ctx.activeBranchId] : []) : ctx.access.branchesWith().filter(ok);
  if (!ids.length) throw forbidden();
  return ids;
}

// ── Enquiries ────────────────────────────────────────────────────────────────

const enquiryOut = (e: { id: string; studentName: string; parentName: string; phone: string; email: string | null; gradeName: string; source: string; status: string; notes: string | null; followUpDate: Date | null; createdAt: Date }) => ({
  id: e.id, studentName: e.studentName, parentName: e.parentName, phone: e.phone, email: e.email, grade: e.gradeName, source: e.source, status: e.status,
  notes: e.notes, followUpDate: toDateString(e.followUpDate), createdAt: toDateString(e.createdAt),
});

/** GET /enquiries — newest first. */
frontOfficeRouter.get('/enquiries', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = readBranches(ctx);
  const rows = await withTenant(ctx.organizationId, (tx) => tx.enquiry.findMany({ where: { branchId: { in: branchIds } }, orderBy: { createdAt: 'desc' }, take: 2000 }));
  res.json(rows.map(enquiryOut));
});

/** POST /enquiries — a walk-in or phone enquiry. Needs frontoffice.manage. */
frontOfficeRouter.post('/enquiries', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    studentName: z.string().trim().min(2).max(150), parentName: z.string().trim().min(2).max(150), phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
    email: z.string().trim().email().max(200).nullable().optional().or(z.literal('')), grade: z.string().trim().min(1).max(30), source: z.string().trim().min(1).max(30),
    notes: z.string().trim().max(1000).nullable().optional(), followUpDate: dateOnly.nullable().optional(), branchId: uuid.optional(),
  }).parse(req.body);
  const branchId = targetBranch(ctx, 'frontoffice.manage', body.branchId);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const e = await tx.enquiry.create({ data: { organizationId: ctx.organizationId, branchId, studentName: body.studentName, parentName: body.parentName, phone: body.phone, email: body.email || null, gradeName: body.grade, source: body.source, status: 'NEW', notes: body.notes ?? null, followUpDate: body.followUpDate ?? null } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Enquiry', entityId: e.id, branchId, after: { studentName: body.studentName, source: body.source } });
    return enquiryOut(e);
  });
  res.status(201).json(out);
});

/** PATCH /enquiries/:id — status, notes, follow-up date. Needs frontoffice.manage. */
frontOfficeRouter.patch('/enquiries/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ status: z.string().toUpperCase().transform((s) => s.replace(/\s+/g, '_')).pipe(z.enum(ENQUIRY_STATUSES)), notes: z.string().trim().max(1000).nullable(), followUpDate: dateOnly.nullable() }).partial().parse(req.body);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.enquiry.findUnique({ where: { id } });
    if (!before) throw notFound('Enquiry');
    if (!ctx.access.can('frontoffice.manage', before.branchId)) throw forbidden();
    const e = await tx.enquiry.update({ where: { id }, data: body });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Enquiry', entityId: id, branchId: before.branchId, before: { status: before.status }, after: { ...body, followUpDate: toDateString(body.followUpDate ?? null) } });
    return enquiryOut(e);
  });
  res.json(out);
});

// ── Visitors ─────────────────────────────────────────────────────────────────

const visitorOut = (v: { id: string; name: string; phone: string | null; purpose: string; toMeet: string; people: number; inAt: Date; outAt: Date | null }) => ({
  id: v.id, name: v.name, phone: v.phone, purpose: v.purpose, toMeet: v.toMeet, people: v.people, inAt: v.inAt.toISOString(), outAt: v.outAt?.toISOString() ?? null,
});

/** GET /visitors?from= — the visitor log (default: the last 30 days). */
frontOfficeRouter.get('/visitors', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ from: dateOnly.optional() }).parse(req.query);
  const branchIds = readBranches(ctx);
  const from = q.from ?? new Date(Date.now() - 30 * 86_400_000);
  const rows = await withTenant(ctx.organizationId, (tx) => tx.visitor.findMany({ where: { branchId: { in: branchIds }, inAt: { gte: from } }, orderBy: { inAt: 'desc' } }));
  res.json(rows.map(visitorOut));
});

/** POST /visitors — check a visitor in (now). Needs frontoffice.manage. */
frontOfficeRouter.post('/visitors', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    name: z.string().trim().min(2).max(150), phone: z.string().trim().max(20).nullable().optional(), purpose: z.string().trim().min(1).max(60),
    toMeet: z.string().trim().min(1).max(150), people: z.number().int().min(1).max(50).default(1), branchId: uuid.optional(),
  }).parse(req.body);
  const branchId = targetBranch(ctx, 'frontoffice.manage', body.branchId);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const v = await tx.visitor.create({ data: { organizationId: ctx.organizationId, branchId, name: body.name, phone: body.phone || null, purpose: body.purpose, toMeet: body.toMeet, people: body.people, inAt: new Date() } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Visitor', entityId: v.id, branchId, after: { name: body.name, purpose: body.purpose } });
    return visitorOut(v);
  });
  res.status(201).json(out);
});

/** POST /visitors/:id/checkout — record when a visitor left. */
frontOfficeRouter.post('/visitors/:id/checkout', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const v = await tx.visitor.findUnique({ where: { id } });
    if (!v) throw notFound('Visitor');
    if (!ctx.access.can('frontoffice.manage', v.branchId)) throw forbidden();
    if (v.outAt) throw conflict('This visitor has already checked out.');
    return visitorOut(await tx.visitor.update({ where: { id }, data: { outAt: new Date() } }));
  });
  res.json(out);
});
