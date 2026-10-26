import { Router } from 'express';
import { z } from 'zod';
import { withTenant } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { ctxOf, requireOrg } from '../../middleware/authenticate.js';

export const orgRouter = Router();

/** GET /me — who am I, what can I do where, and which students are mine (student / parent). */
orgRouter.get('/me', async (req, res) => {
  const ctx = ctxOf(req);
  const data = await withTenant(ctx.organizationId, async (tx) => {
    const [user, organization, regions, linked, staff, studentCounts] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, username: true, name: true, email: true, phone: true, mustChangePassword: true, lastLoginAt: true } }),
      tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { id: true, name: true, subdomain: true, logoUrl: true, status: true, trialEndsAt: true, plan: { select: { code: true, name: true } } } }),
      tx.region.findMany({ select: { id: true, name: true } }),
      tx.student.findMany({
        where: { OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] },
        select: { id: true, admissionNo: true, firstName: true, lastName: true, branchId: true, userId: true },
      }),
      tx.staff.findFirst({ where: { userId: ctx.userId }, select: { id: true, employeeCode: true, branchId: true, department: true, staffType: true } }),
      tx.student.groupBy({ by: ['branchId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
    ]);
    return { user, organization, regions, linked, staff, studentCounts };
  });

  const { access } = ctx;
  const branchName = new Map(access.branches.map((b) => [b.id, b]));
  const regionName = new Map(data.regions.map((r) => [r.id, r.name]));
  res.json({
    user: data.user,
    organization: data.organization,
    memberships: access.memberships.map((m) => ({
      id: m.id,
      role: { code: m.roleCode, name: m.roleName },
      scopeType: m.scopeType,
      region: m.regionId ? { id: m.regionId, name: regionName.get(m.regionId) ?? null } : null,
      branch: m.branchId ? { id: m.branchId, code: branchName.get(m.branchId)?.code ?? null, name: branchName.get(m.branchId)?.name ?? null } : null,
    })),
    organizationPermissions: [...access.orgPermissions].sort(),
    branches: access.branches
      .filter((b) => access.branchPermissions.has(b.id))
      .map((b) => ({ ...b, students: data.studentCounts.find((c) => c.branchId === b.id)?._count._all ?? 0, permissions: [...access.branchPermissions.get(b.id)!].sort() })),
    /** The caller's staff record (teachers and other employees). */
    staff: data.staff,
    students: data.linked.map((s) => ({
      id: s.id,
      admissionNo: s.admissionNo,
      name: [s.firstName, s.lastName].filter(Boolean).join(' '),
      branchId: s.branchId,
      relation: s.userId === ctx.userId ? 'SELF' : 'CHILD',
    })),
  });
});

/** GET /org — organization profile and settings. */
orgRouter.get('/org', async (req, res) => {
  const ctx = ctxOf(req);
  const org = await withTenant(ctx.organizationId, (tx) =>
    tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, subdomain: true, logoUrl: true, contactEmail: true, contactPhone: true, status: true, trialEndsAt: true, settings: true, plan: { select: { code: true, name: true } } },
    }),
  );
  res.json({ ...org, settings: parseJson(org.settings) });
});

const orgUpdate = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  contactEmail: z.string().trim().email().max(200).optional(),
  contactPhone: z.string().trim().min(6).max(20).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/** PUT /org — needs org.manage. */
orgRouter.put('/org', requireOrg('org.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const body = orgUpdate.parse(req.body);
  const org = await withTenant(ctx.organizationId, async (tx) => {
    const updated = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { ...body, settings: body.settings === undefined ? undefined : JSON.stringify(body.settings) },
      select: { id: true, name: true, contactEmail: true, contactPhone: true, logoUrl: true, settings: true },
    });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Organization', entityId: ctx.organizationId, after: body });
    return updated;
  });
  res.json({ ...org, settings: parseJson(org.settings) });
});

/** GET /regions */
orgRouter.get('/regions', async (req, res) => {
  const ctx = ctxOf(req);
  res.json(await withTenant(ctx.organizationId, (tx) => tx.region.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })));
});

/** POST /regions — needs org.manage. */
orgRouter.post('/regions', requireOrg('org.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(req.body);
  const region = await withTenant(ctx.organizationId, async (tx) => {
    const created = await tx.region.create({ data: { organizationId: ctx.organizationId, name }, select: { id: true, name: true } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Region', entityId: created.id, after: created });
    return created;
  });
  res.status(201).json(region);
});

const branchSelect = {
  id: true, code: true, name: true, board: true, affiliationNo: true, address: true, city: true, state: true,
  phone: true, email: true, isActive: true, region: { select: { id: true, name: true } },
} as const;

/** GET /branches — branches the user has a role in (all of them for organization-level roles). */
orgRouter.get('/branches', async (req, res) => {
  const ctx = ctxOf(req);
  const visible = ctx.access.can('org.manage') ? undefined : ctx.access.branchesWith();
  const branches = await withTenant(ctx.organizationId, (tx) =>
    tx.branch.findMany({ where: visible ? { id: { in: visible } } : {}, select: branchSelect, orderBy: { name: 'asc' } }),
  );
  res.json(branches);
});

const branchBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, '2–20 letters, digits or -'),
  name: z.string().trim().min(3).max(200),
  regionId: z.string().uuid().nullable().optional(),
  board: z.string().trim().max(40).nullable().optional(),
  affiliationNo: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().min(3).max(500),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** POST /branches — needs org.manage. */
orgRouter.post('/branches', requireOrg('org.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const body = branchBody.parse(req.body);
  const branch = await withTenant(ctx.organizationId, async (tx) => {
    if (body.regionId && !(await tx.region.findUnique({ where: { id: body.regionId } }))) throw badRequest('Unknown region.');
    const created = await tx.branch.create({ data: { ...body, organizationId: ctx.organizationId }, select: branchSelect });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Branch', entityId: created.id, branchId: created.id, after: body });
    return created;
  });
  res.status(201).json(branch);
});

/** PATCH /branches/:id — needs org.manage. */
orgRouter.patch('/branches/:id', requireOrg('org.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = branchBody.partial().parse(req.body);
  const branch = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.branch.findUnique({ where: { id }, select: branchSelect });
    if (!before) throw notFound('Branch');
    if (body.regionId && !(await tx.region.findUnique({ where: { id: body.regionId } }))) throw badRequest('Unknown region.');
    const updated = await tx.branch.update({ where: { id }, data: body, select: branchSelect });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Branch', entityId: id, branchId: id, before, after: body });
    return updated;
  });
  res.json(branch);
});

const yearSelect = { id: true, name: true, startDate: true, endDate: true, isCurrent: true } as const;
const yearOut = (y: { id: string; name: string; startDate: Date; endDate: Date; isCurrent: boolean }) => ({
  ...y,
  startDate: toDateString(y.startDate),
  endDate: toDateString(y.endDate),
});

/** GET /academic-years */
orgRouter.get('/academic-years', async (req, res) => {
  const ctx = ctxOf(req);
  const years = await withTenant(ctx.organizationId, (tx) => tx.academicYear.findMany({ select: yearSelect, orderBy: { startDate: 'desc' } }));
  res.json(years.map(yearOut));
});

/** POST /academic-years — needs org.manage. { name: "2027-28", startDate, endDate } */
orgRouter.post('/academic-years', requireOrg('org.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const body = z
    .object({ name: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Like 2027-28'), startDate: dateOnly, endDate: dateOnly })
    .refine((b) => b.endDate > b.startDate, { message: 'End date must be after start date', path: ['endDate'] })
    .parse(req.body);
  const year = await withTenant(ctx.organizationId, async (tx) => {
    const created = await tx.academicYear.create({ data: { ...body, organizationId: ctx.organizationId, isCurrent: false }, select: yearSelect });
    await audit(tx, ctx, { action: 'CREATE', entity: 'AcademicYear', entityId: created.id, after: yearOut(created) });
    return created;
  });
  res.status(201).json(yearOut(year));
});

/** POST /academic-years/:id/make-current — needs org.manage. Exactly one year is current. */
orgRouter.post('/academic-years/:id/make-current', requireOrg('org.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const year = await withTenant(ctx.organizationId, async (tx) => {
    if (!(await tx.academicYear.findUnique({ where: { id } }))) throw notFound('Academic year');
    await tx.academicYear.updateMany({ where: { isCurrent: true, NOT: { id } }, data: { isCurrent: false } });
    const updated = await tx.academicYear.update({ where: { id }, data: { isCurrent: true }, select: yearSelect });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'AcademicYear', entityId: id, after: { isCurrent: true } });
    return updated;
  });
  res.json(yearOut(year));
});
