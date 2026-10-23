import { Router } from 'express';
import { z } from 'zod';
import type { RequestContext } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { idParam } from '../../lib/http.js';
import { memberBranches, readScope } from '../../lib/scope.js';
import { ctxOf } from '../../middleware/authenticate.js';

/**
 * Announcements (notice board) and one-to-one messages.
 *  - Staff see every announcement of their branches; students see those for everyone, all
 *    students or their section; parents also those for parents.
 *  - Principals / office post to anyone; a teacher (no reports.view) posts only to sections.
 *  - Messages go between users. Each side is described as a teacher / staff member, a student or
 *    a parent (with the child the conversation is about), so pages can show who is talking.
 */
export const communicationRouter = Router();

const uuid = z.string().uuid().transform((s) => s.toLowerCase());
const CATEGORIES = ['ACADEMIC', 'FEES', 'EVENT', 'GENERAL'] as const;
const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const AUDIENCES = ['EVERYONE', 'STAFF', 'STUDENTS', 'PARENTS', 'SECTION'] as const;

const isSelfOnly = (ctx: RequestContext) => ctx.access.branchesWith('self.view').length > 0 && ctx.access.branchesWith('students.read').length === 0;

/** "principal" | "teacher" | "office" for the person who posted. */
async function posterRoles(tx: Tx, userIds: string[]) {
  const [members, users] = await Promise.all([
    tx.membership.findMany({ where: { userId: { in: userIds }, isActive: true }, select: { userId: true, role: { select: { code: true } } } }),
    tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const role = new Map<string, 'principal' | 'teacher' | 'office'>();
  for (const id of userIds) {
    const codes = members.filter((m) => m.userId === id).map((m) => m.role.code);
    role.set(id, codes.some((c) => ['PRINCIPAL', 'VICE_PRINCIPAL', 'SCHOOL_ADMIN', 'GROUP_OWNER'].includes(c)) ? 'principal' : codes.includes('TEACHER') ? 'teacher' : 'office');
  }
  return { role, name: new Map(users.map((u) => [u.id, u.name])) };
}

// ═════════════════════════════════════════════════════════════════════════════
// Announcements
// ═════════════════════════════════════════════════════════════════════════════

/** GET /announcements — the notice board as the caller may see it, newest first. */
communicationRouter.get('/announcements', async (req, res) => {
  const ctx = ctxOf(req);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    let branchIds: string[];
    let audienceFilter: object | undefined;
    if (isSelfOnly(ctx)) {
      const scope = await readScope(tx, ctx, 'students.read', year.id);
      if (scope.kind !== 'self') throw forbidden();
      branchIds = scope.branchIds;
      const isParent = !(await tx.student.count({ where: { userId: ctx.userId } }));
      audienceFilter = {
        audiences: { some: { OR: [{ audienceType: { in: ['EVERYONE', 'STUDENTS', ...(isParent ? ['PARENTS'] : [])] } }, { audienceType: 'SECTION', sectionId: { in: scope.sectionIds } }] } },
      };
    } else branchIds = memberBranches(ctx);

    const rows = await tx.announcement.findMany({
      where: { OR: [{ branchId: { in: branchIds } }, { branchId: null }], ...(audienceFilter ?? {}) },
      include: { audiences: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const sectionIds = [...new Set(rows.flatMap((r) => r.audiences.map((a) => a.sectionId).filter((x): x is string => !!x)))];
    const sections = new Map((await tx.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true, grade: { select: { name: true } } } })).map((s) => [s.id, `${s.grade.name}-${s.name}`]));
    const posters = await posterRoles(tx, [...new Set(rows.map((r) => r.createdById))]);
    return rows.map((r) => ({
      id: r.id, branchId: r.branchId, title: r.title, body: r.body, category: r.category, priority: r.priority, createdAt: r.createdAt.toISOString(),
      fromName: posters.name.get(r.createdById) ?? '', fromRole: posters.role.get(r.createdById) ?? 'office', mine: r.createdById === ctx.userId,
      audience: r.audiences.map((a) => ({ type: a.audienceType, sectionId: a.sectionId, sectionName: a.sectionId ? sections.get(a.sectionId) ?? null : null })),
    }));
  });
  res.json(out);
});

/** POST /announcements — needs announcements.send. Teachers may post only to sections. */
communicationRouter.post('/announcements', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10_000),
    category: z.string().toUpperCase().pipe(z.enum(CATEGORIES)).default('GENERAL'),
    priority: z.string().toUpperCase().pipe(z.enum(PRIORITIES)).default('MEDIUM'),
    audience: z.array(z.object({ type: z.string().toUpperCase().pipe(z.enum(AUDIENCES)), sectionId: uuid.optional() })).min(1).max(30),
    /** null = the whole organization (needs announcements.send at organization level). */
    branchId: uuid.nullable().optional(),
  }).parse(req.body);
  const branchId = body.branchId === null ? null : (body.branchId ?? ctx.activeBranchId ?? ctx.access.branchesWith('announcements.send')[0] ?? null);
  if (branchId ? !ctx.access.can('announcements.send', branchId) : !ctx.access.can('announcements.send')) throw forbidden();
  for (const a of body.audience) if ((a.type === 'SECTION') !== !!a.sectionId) throw badRequest('Give a section for SECTION audiences (and only for them).');
  const teacherOnly = branchId ? !ctx.access.can('reports.view', branchId) : false;
  if (teacherOnly && body.audience.some((a) => a.type !== 'SECTION')) throw forbidden('Teachers can post notices to their classes only.');

  const out = await withTenant(ctx.organizationId, async (tx) => {
    const sectionIds = body.audience.map((a) => a.sectionId).filter((x): x is string => !!x);
    if (sectionIds.length) {
      const found = await tx.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, branchId: true } });
      if (found.length !== new Set(sectionIds).size || (branchId && found.some((s) => s.branchId !== branchId))) throw badRequest('Unknown section in the audience.');
    }
    const a = await tx.announcement.create({
      data: {
        organizationId: ctx.organizationId, branchId, title: body.title, body: body.body, category: body.category, priority: body.priority, createdById: ctx.userId,
        audiences: { create: body.audience.map((x) => ({ organizationId: ctx.organizationId, audienceType: x.type, sectionId: x.sectionId ?? null })) },
      },
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Announcement', entityId: a.id, branchId, after: { title: body.title, audience: body.audience } });
    return { id: a.id, createdAt: a.createdAt.toISOString() };
  });
  res.status(201).json(out);
});

/** DELETE /announcements/:id — the person who posted it, or a principal / office (reports.view) of the branch. */
communicationRouter.delete('/announcements/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const a = await tx.announcement.findUnique({ where: { id } });
    if (!a) throw notFound('Announcement');
    const manager = a.branchId ? ctx.access.can('announcements.send', a.branchId) && ctx.access.can('reports.view', a.branchId) : ctx.access.can('announcements.send');
    if (a.createdById !== ctx.userId && !manager) throw forbidden();
    await tx.announcementAudience.deleteMany({ where: { announcementId: id } });
    await tx.announcement.delete({ where: { id } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Announcement', entityId: id, branchId: a.branchId, before: { title: a.title } });
  });
  res.status(204).end();
});

// ═════════════════════════════════════════════════════════════════════════════
// Messages
// ═════════════════════════════════════════════════════════════════════════════

type Party = { userId: string; kind: 'teacher' | 'staff' | 'student' | 'parent' | 'user'; staffId: string | null; studentId: string | null; name: string };

/** Describes users as message participants (a parent is described with the child the message is about). */
async function describe(tx: Tx, userIds: string[], aboutStudent: Map<string, string | null>): Promise<Map<string, Party>> {
  const [staff, students, guardians, users] = await Promise.all([
    tx.staff.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true, name: true, staffType: true } }),
    tx.student.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true, firstName: true, lastName: true } }),
    tx.guardian.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true, students: { select: { studentId: true } } } }),
    tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const out = new Map<string, Party>();
  for (const u of users) {
    const st = staff.find((s) => s.userId === u.id);
    const pupil = students.find((s) => s.userId === u.id);
    const g = guardians.find((x) => x.userId === u.id);
    if (st) out.set(u.id, { userId: u.id, kind: st.staffType === 'TEACHING' ? 'teacher' : 'staff', staffId: st.id, studentId: null, name: st.name });
    else if (pupil) out.set(u.id, { userId: u.id, kind: 'student', staffId: null, studentId: pupil.id, name: [pupil.firstName, pupil.lastName].filter(Boolean).join(' ') });
    else if (g) out.set(u.id, { userId: u.id, kind: 'parent', staffId: null, studentId: aboutStudent.get(u.id) ?? g.students[0]?.studentId ?? null, name: g.name });
    else out.set(u.id, { userId: u.id, kind: 'user', staffId: null, studentId: null, name: u.name });
  }
  return out;
}

/** GET /messages — the caller's inbox and sent messages; `?scope=school` lets a principal (reports.view) oversee the branch's messages. */
communicationRouter.get('/messages', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ scope: z.enum(['mine', 'school']).default('mine') }).parse(req.query);
  const out = await withTenant(ctx.organizationId, async (tx) => {
    let where: object = { OR: [{ fromUserId: ctx.userId }, { toUserId: ctx.userId }] };
    if (q.scope === 'school') {
      const branches = ctx.activeBranchId ? [ctx.activeBranchId].filter((b) => ctx.access.can('reports.view', b)) : ctx.access.branchesWith('reports.view');
      if (!branches.length) throw forbidden();
      const users = (await tx.membership.findMany({ where: { branchId: { in: branches } }, select: { userId: true } })).map((m) => m.userId);
      where = { OR: [{ fromUserId: { in: users } }, { toUserId: { in: users } }] };
    }
    const rows = await tx.message.findMany({ where, orderBy: { sentAt: 'desc' }, take: 1000 });
    const about = new Map<string, string | null>();
    for (const m of rows) if (m.aboutStudentId) { about.set(m.fromUserId, m.aboutStudentId); about.set(m.toUserId, m.aboutStudentId); }
    const parties = await describe(tx, [...new Set(rows.flatMap((m) => [m.fromUserId, m.toUserId]))], about);
    const party = (id: string, aboutId: string | null) => {
      const p = parties.get(id)!;
      return p.kind === 'parent' && aboutId ? { ...p, studentId: aboutId } : p;
    };
    return rows.map((m) => ({
      id: m.id, subject: m.subject, body: m.body, sentAt: m.sentAt.toISOString(), readAt: m.readAt?.toISOString() ?? null, aboutStudentId: m.aboutStudentId,
      from: party(m.fromUserId, m.aboutStudentId), to: party(m.toUserId, m.aboutStudentId),
    }));
  });
  res.json(out);
});

/**
 * POST /messages — needs messages.send. The recipient is a staff member, a student, or a student's
 * parent (their primary guardian with a sign-in). Students and parents may write to staff of their
 * child's branch only; staff may write to anyone in their branches.
 */
communicationRouter.post('/messages', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z.object({
    to: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('staff'), staffId: uuid }),
      z.object({ kind: z.literal('student'), studentId: uuid }),
      z.object({ kind: z.literal('parent'), studentId: uuid }),
    ]),
    subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000),
    aboutStudentId: uuid.optional(),
  }).parse(req.body);
  if (!ctx.access.canAnywhere('messages.send')) throw forbidden();

  const out = await withTenant(ctx.organizationId, async (tx) => {
    let toUserId: string | null = null;
    let branchId: string;
    let aboutStudentId = body.aboutStudentId ?? null;
    if (body.to.kind === 'staff') {
      const s = await tx.staff.findUnique({ where: { id: body.to.staffId }, select: { userId: true, branchId: true, status: true } });
      if (!s || s.status === 'RESIGNED') throw notFound('Staff member');
      toUserId = s.userId;
      branchId = s.branchId;
    } else {
      const st = await tx.student.findUnique({ where: { id: body.to.studentId }, select: { id: true, userId: true, branchId: true, guardians: { where: { guardian: { userId: { not: null } } }, select: { guardian: { select: { userId: true } } }, orderBy: { isPrimary: 'desc' } } } });
      if (!st) throw notFound('Student');
      branchId = st.branchId;
      toUserId = body.to.kind === 'student' ? st.userId : st.guardians[0]?.guardian.userId ?? null;
      aboutStudentId = st.id;
    }
    if (!toUserId) throw badRequest(`${body.to.kind === 'staff' ? 'This staff member' : body.to.kind === 'student' ? 'This student' : 'This student’s parent'} has no sign-in yet, so cannot receive messages.`);
    if (toUserId === ctx.userId) throw badRequest('You cannot message yourself.');

    if (isSelfOnly(ctx)) {
      if (body.to.kind !== 'staff') throw forbidden('You can message school staff only.');
      const year = await currentYear(tx);
      const scope = await readScope(tx, ctx, 'students.read', year.id);
      if (!scope.branchIds.includes(branchId)) throw forbidden();
      if (aboutStudentId && !(scope.kind === 'self' && scope.studentIds.includes(aboutStudentId))) throw forbidden();
      aboutStudentId ??= scope.kind === 'self' && !(await tx.student.count({ where: { userId: ctx.userId } })) ? scope.studentIds[0] : null;
    } else if (!ctx.access.can('messages.send', branchId)) throw forbidden();

    const m = await tx.message.create({ data: { organizationId: ctx.organizationId, fromUserId: ctx.userId, toUserId, aboutStudentId, subject: body.subject, body: body.body } });
    return { id: m.id, sentAt: m.sentAt.toISOString() };
  });
  res.status(201).json(out);
});

/** POST /messages/:id/read — the recipient marks a message as read. */
communicationRouter.post('/messages/:id/read', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  await withTenant(ctx.organizationId, async (tx) => {
    const m = await tx.message.findUnique({ where: { id }, select: { toUserId: true, readAt: true } });
    if (!m || m.toUserId !== ctx.userId) throw notFound('Message');
    if (!m.readAt) await tx.message.update({ where: { id }, data: { readAt: new Date() } });
  });
  res.json({ ok: true });
});
