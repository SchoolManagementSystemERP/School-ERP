import { Router } from 'express';
import { z } from 'zod';
import { targetBranch } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { forPatch, idParam } from '../../lib/http.js';
import { ctxOf, requireAnywhere } from '../../middleware/authenticate.js';

export const classesRouter = Router();

/**
 * GET /grades — classes with their sections and how many students are enrolled this year.
 * Visible to anyone with a role in the branch (pages need the class list everywhere).
 */
classesRouter.get('/grades', async (req, res) => {
  const ctx = ctxOf(req);
  const branchIds = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.access.branchesWith();
  if (branchIds.length === 0) throw forbidden();

  const { grades, counts } = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const grades = await tx.grade.findMany({
      where: { branchId: { in: branchIds } },
      select: {
        id: true, branchId: true, name: true, sortOrder: true, medium: true,
        sections: { select: { id: true, name: true, capacity: true, room: true, classTeacherId: true }, orderBy: { name: 'asc' } },
      },
      orderBy: [{ branchId: 'asc' }, { sortOrder: 'asc' }],
    });
    const counts = await tx.enrollment.groupBy({
      by: ['sectionId'],
      where: { academicYearId: year.id, status: 'ACTIVE', branchId: { in: branchIds } },
      _count: { _all: true },
    });
    return { grades, counts };
  });

  const enrolled = new Map(counts.map((c) => [c.sectionId, c._count._all]));
  res.json(grades.map((g) => ({ ...g, sections: g.sections.map((s) => ({ ...s, enrolled: enrolled.get(s.id) ?? 0 })) })));
});

/** POST /grades — needs classes.manage in the branch. */
classesRouter.post('/grades', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z
    .object({
      branchId: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(30),
      sortOrder: z.number().int().min(-5).max(20),
      medium: z.string().trim().max(30).nullable().optional(),
      sections: z.array(z.string().trim().min(1).max(10)).max(20).default([]),
    })
    .parse(req.body);
  const branchId = targetBranch(ctx, 'classes.manage', body.branchId);

  const grade = await withTenant(ctx.organizationId, async (tx) => {
    const created = await tx.grade.create({
      data: { organizationId: ctx.organizationId, branchId, name: body.name, sortOrder: body.sortOrder, medium: body.medium ?? null },
    });
    for (const name of new Set(body.sections.map((s) => s.toUpperCase()))) {
      await tx.section.create({ data: { organizationId: ctx.organizationId, branchId, gradeId: created.id, name } });
    }
    await audit(tx, ctx, { action: 'CREATE', entity: 'Grade', entityId: created.id, branchId, after: body });
    return tx.grade.findUniqueOrThrow({ where: { id: created.id }, include: { sections: { orderBy: { name: 'asc' } } } });
  });
  res.status(201).json(grade);
});

const sectionBody = z.object({
  name: z.string().trim().toUpperCase().min(1).max(10),
  capacity: z.number().int().min(1).max(200).optional(),
  room: z.string().trim().max(30).nullable().optional(),
  classTeacherId: z.string().uuid().nullable().optional(), // Staff id
});

/** POST /grades/:id/sections — needs classes.manage in the grade's branch. */
classesRouter.post('/grades/:id/sections', async (req, res) => {
  const ctx = ctxOf(req);
  const gradeId = idParam(req);
  const body = sectionBody.parse(req.body);
  const section = await withTenant(ctx.organizationId, async (tx) => {
    const grade = await tx.grade.findUnique({ where: { id: gradeId }, select: { branchId: true } });
    if (!grade) throw notFound('Class');
    if (!ctx.access.can('classes.manage', grade.branchId)) throw forbidden();
    if (body.classTeacherId) await assertTeacherInBranch(tx, body.classTeacherId, grade.branchId);
    const created = await tx.section.create({ data: { ...body, organizationId: ctx.organizationId, branchId: grade.branchId, gradeId } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Section', entityId: created.id, branchId: grade.branchId, after: body });
    return created;
  });
  res.status(201).json(section);
});

/** PATCH /sections/:id — rename, capacity, room, class teacher. Needs classes.manage. */
classesRouter.patch('/sections/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = forPatch(sectionBody).parse(req.body);
  const section = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.section.findUnique({ where: { id } });
    if (!before) throw notFound('Section');
    if (!ctx.access.can('classes.manage', before.branchId)) throw forbidden();
    if (body.classTeacherId) await assertTeacherInBranch(tx, body.classTeacherId, before.branchId);
    const updated = await tx.section.update({ where: { id }, data: body });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Section', entityId: id, branchId: before.branchId, before, after: body });
    return updated;
  });
  res.json(section);
});

/** PATCH /grades/:id — rename, reorder or change medium. Needs classes.manage. */
classesRouter.patch('/grades/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z.object({ name: z.string().trim().min(1).max(30), sortOrder: z.number().int().min(-5).max(20), medium: z.string().trim().max(30).nullable() }).partial().parse(req.body);
  const grade = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.grade.findUnique({ where: { id } });
    if (!before) throw notFound('Class');
    if (!ctx.access.can('classes.manage', before.branchId)) throw forbidden();
    const updated = await tx.grade.update({ where: { id }, data: body });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Grade', entityId: id, branchId: before.branchId, before, after: body });
    return updated;
  });
  res.json(grade);
});

/** DELETE /sections/:id — only a section nobody has ever been enrolled in. */
classesRouter.delete('/sections/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const sec = await tx.section.findUnique({ where: { id } });
    if (!sec) throw notFound('Section');
    if (!ctx.access.can('classes.manage', sec.branchId)) throw forbidden();
    if (await tx.enrollment.count({ where: { sectionId: id } })) throw badRequest('Students are enrolled in this section — move them first.');
    await tx.sectionSubject.deleteMany({ where: { sectionId: id } });
    await tx.section.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Section', entityId: id, branchId: sec.branchId, before: sec });
  });
  res.status(204).end();
});

/** DELETE /grades/:id — only a class with no sections left. */
classesRouter.delete('/grades/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const g = await tx.grade.findUnique({ where: { id } });
    if (!g) throw notFound('Class');
    if (!ctx.access.can('classes.manage', g.branchId)) throw forbidden();
    if (await tx.section.count({ where: { gradeId: id } })) throw badRequest('Remove the sections of this class first.');
    if (await tx.feePlan.count({ where: { gradeId: id } })) throw badRequest('This class has a fee plan — remove it in Accounts first.');
    await tx.grade.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Grade', entityId: id, branchId: g.branchId, before: g });
  });
  res.status(204).end();
});

async function assertTeacherInBranch(tx: Tx, staffId: string, branchId: string) {
  const staff = await tx.staff.findUnique({ where: { id: staffId }, select: { branchId: true, staffType: true, status: true } });
  if (!staff || staff.branchId !== branchId || staff.staffType !== 'TEACHING' || staff.status !== 'ACTIVE') {
    throw badRequest('Class teacher must be an active teacher of this branch.');
  }
}

/** GET /subjects — organization-wide subject list. */
classesRouter.get('/subjects', async (req, res) => {
  const ctx = ctxOf(req);
  res.json(await withTenant(ctx.organizationId, (tx) => tx.subject.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } })));
});

/** POST /subjects — needs classes.manage somewhere. */
classesRouter.post('/subjects', requireAnywhere('classes.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const body = z
    .object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/), name: z.string().trim().min(2).max(100) })
    .parse(req.body);
  const subject = await withTenant(ctx.organizationId, async (tx) => {
    const created = await tx.subject.create({ data: { ...body, organizationId: ctx.organizationId }, select: { id: true, code: true, name: true } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Subject', entityId: created.id, after: body });
    return created;
  });
  res.status(201).json(subject);
});
