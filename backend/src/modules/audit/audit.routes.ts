import { Router } from 'express';
import { z } from 'zod';
import { withTenant } from '../../db/prisma.js';
import { forbidden } from '../../lib/errors.js';
import { ctxOf } from '../../middleware/authenticate.js';

export const auditRouter = Router();

auditRouter.get('/audit-log', async (req, res) => {
  const ctx = ctxOf(req);
  const auditBranchIds = ctx.access.branchesWith('audit.read');
  const hrRoleBranches = ctx.access.memberships
    .filter((membership) => membership.roleCode === 'HR')
    .flatMap((membership) => ctx.access.branches
      .filter((branch) => membership.scopeType === 'ORG'
        || (membership.scopeType === 'REGION' && membership.regionId === branch.regionId)
        || (membership.scopeType === 'BRANCH' && membership.branchId === branch.id))
      .map((branch) => branch.id));
  const hrBranchIds = ctx.access.branchesWith('staff.write').filter((branchId) => hrRoleBranches.includes(branchId));
  if (!ctx.access.orgPermissions.has('audit.read') && !auditBranchIds.length && !hrBranchIds.length) throw forbidden();

  const query = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'READ', 'ACTION']).optional(),
    entity: z.string().trim().min(1).max(60).optional(),
    branchId: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  }).superRefine((value, issue) => {
    if (value.from && value.to && value.from > value.to) {
      issue.addIssue({ code: 'custom', message: 'Start date must not be after end date.', path: ['from'] });
    }
  }).parse(req.query);

  const result = await withTenant(ctx.organizationId, async (tx) => {
    const orgWide = ctx.access.orgPermissions.has('audit.read');
    const branchIds = orgWide
      ? (await tx.branch.findMany({ where: { isActive: true }, select: { id: true } })).map((branch) => branch.id)
      : [...new Set([...auditBranchIds, ...hrBranchIds])];
    if (query.branchId && !branchIds.includes(query.branchId.toLowerCase())) throw forbidden();
    const toExclusive = query.to ? new Date(`${query.to}T00:00:00.000Z`) : undefined;
    toExclusive?.setUTCDate(toExclusive.getUTCDate() + 1);

    const where = {
      organizationId: ctx.organizationId,
      ...(query.branchId
        ? { branchId: query.branchId.toLowerCase() }
        : orgWide
          ? { OR: [{ branchId: null }, { branchId: { in: branchIds } }] }
          : { branchId: { in: branchIds } }),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entity ? { entity: { contains: query.entity } } : {}),
      ...(query.from || query.to ? {
        createdAt: {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
          ...(toExclusive ? { lt: toExclusive } : {}),
        },
      } : {}),
    };

    const [total, events] = await Promise.all([
      tx.auditLog.count({ where }),
      tx.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const userIds = [...new Set(events.map((event) => event.userId))];
    const eventBranchIds = [...new Set(events.flatMap((event) => event.branchId ? [event.branchId] : []))];
    const [users, branches] = await Promise.all([
      userIds.length ? tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, username: true } }) : [],
      eventBranchIds.length ? tx.branch.findMany({ where: { id: { in: eventBranchIds } }, select: { id: true, name: true } }) : [],
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const branchById = new Map(branches.map((branch) => [branch.id, branch]));

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      events: events.map((event) => ({
        id: event.id,
        createdAt: event.createdAt.toISOString(),
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        branch: event.branchId ? branchById.get(event.branchId)?.name ?? 'Branch' : 'Organization',
        user: userById.get(event.userId)?.name ?? 'Unknown user',
        username: userById.get(event.userId)?.username ?? '',
        ip: event.ip,
        before: event.before,
        after: event.after,
      })),
    };
  });

  res.json(result);
});
