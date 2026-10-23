import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import type { Access } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js';
import { idParam, pageResult, paging } from '../../lib/http.js';
import { ctxOf, requireAnywhere, requireOrg } from '../../middleware/authenticate.js';
import { PASSWORD_ROUNDS, passwordSchema } from '../auth/auth.routes.js';

export const usersRouter = Router();
// Only these paths: a path-less guard would also block every router mounted after this one.
usersRouter.use(['/users', '/roles', '/permissions'], requireAnywhere('users.manage'));

type Scope = { scopeType: string; regionId: string | null; branchId: string | null };

/** Organization-level managers handle every scope; branch managers only memberships in their branches. */
function canManageScope(access: Access, m: Scope): boolean {
  if (access.can('users.manage')) return true;
  return m.scopeType === 'BRANCH' && !!m.branchId && access.can('users.manage', m.branchId);
}

const SCOPE_FOR_LEVEL: Record<string, string> = { ORG: 'ORG', REGION: 'REGION', BRANCH: 'BRANCH', SELF: 'BRANCH' };

const membershipInput = z
  .object({
    roleId: z.string().uuid().optional(),
    roleCode: z.string().trim().toUpperCase().max(40).optional(),
    scopeType: z.enum(['ORG', 'REGION', 'BRANCH']),
    regionId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
  })
  .refine((m) => m.roleId || m.roleCode, { message: 'roleId or roleCode is required', path: ['roleId'] })
  .refine((m) => m.scopeType !== 'REGION' || m.regionId, { message: 'regionId is required for REGION scope', path: ['regionId'] })
  .refine((m) => m.scopeType !== 'BRANCH' || m.branchId, { message: 'branchId is required for BRANCH scope', path: ['branchId'] });

/** Checks the role and place exist, fit together, and that the caller may grant them. */
async function resolveMembership(tx: Tx, access: Access, input: z.infer<typeof membershipInput>) {
  const role = await tx.role.findFirst({
    where: input.roleId ? { id: input.roleId } : { code: input.roleCode },
    select: { id: true, code: true, level: true },
  });
  if (!role) throw badRequest(`Unknown role ${input.roleCode ?? input.roleId}.`);
  if (SCOPE_FOR_LEVEL[role.level] !== input.scopeType) {
    throw badRequest(`Role ${role.code} is a ${role.level}-level role; use scopeType ${SCOPE_FOR_LEVEL[role.level]}.`);
  }
  const scope: Scope = {
    scopeType: input.scopeType,
    regionId: input.scopeType === 'REGION' ? input.regionId!.toLowerCase() : null,
    branchId: input.scopeType === 'BRANCH' ? input.branchId!.toLowerCase() : null,
  };
  if (scope.regionId && !(await tx.region.findUnique({ where: { id: scope.regionId } }))) throw badRequest('Unknown region.');
  if (scope.branchId && !(await tx.branch.findUnique({ where: { id: scope.branchId } }))) throw badRequest('Unknown branch.');
  if (!canManageScope(access, scope)) throw forbidden(`You cannot grant ${role.code} at this level.`);
  return { roleId: role.id, ...scope };
}

const userSelect = {
  id: true, username: true, name: true, email: true, phone: true, isActive: true, mustChangePassword: true, lastLoginAt: true, createdAt: true,
  memberships: {
    where: { isActive: true },
    select: { id: true, scopeType: true, regionId: true, branchId: true, role: { select: { id: true, code: true, name: true } } },
  },
} as const;

/** Loads a user the caller may manage: every one of their memberships must be in the caller's scope. */
async function manageableUser(tx: Tx, access: Access, id: string) {
  const user = await tx.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw notFound('User');
  const ok = user.memberships.length > 0 ? user.memberships.every((m) => canManageScope(access, m)) : access.can('users.manage');
  if (!ok) throw forbidden('This user has roles outside your scope.');
  return user;
}

const temporaryPassword = () => `Erp${randomBytes(5).toString('hex')}7`;

/** GET /users?search=&branchId=&role=&active=&page=&pageSize= */
usersRouter.get('/users', async (req, res) => {
  const ctx = ctxOf(req);
  const q = paging
    .extend({
      search: z.string().trim().max(80).optional(),
      branchId: z.string().uuid().optional(),
      role: z.string().trim().toUpperCase().max(40).optional(),
      active: z.enum(['true', 'false']).optional(),
    })
    .parse(req.query);

  const orgWide = ctx.access.can('users.manage');
  const managed = ctx.access.branchesWith('users.manage');
  const branchFilter = q.branchId ? [q.branchId.toLowerCase()] : orgWide ? undefined : managed;
  if (q.branchId && !orgWide && !managed.includes(q.branchId.toLowerCase())) throw forbidden();

  const where = {
    ...(q.active ? { isActive: q.active === 'true' } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search } }, { username: { contains: q.search } }, { phone: { contains: q.search } }] } : {}),
    ...(branchFilter || q.role
      ? { memberships: { some: { isActive: true, ...(branchFilter ? { branchId: { in: branchFilter } } : {}), ...(q.role ? { role: { code: q.role } } : {}) } } }
      : {}),
  };

  const [items, total] = await withTenant(ctx.organizationId, (tx) =>
    Promise.all([
      tx.user.findMany({ where, select: userSelect, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      tx.user.count({ where }),
    ]),
  );
  res.json(pageResult(items, total, q.page, q.pageSize));
});

/** GET /users/:id */
usersRouter.get('/users/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  res.json(await withTenant(ctx.organizationId, (tx) => manageableUser(tx, ctx.access, id)));
});

/**
 * POST /users — { username, name, email?, phone?, password?, memberships: [...] }.
 * Without a password a temporary one is generated and returned once; the user must change it at first sign-in.
 */
usersRouter.post('/users', async (req, res) => {
  const ctx = ctxOf(req);
  const body = z
    .object({
      username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._@-]+$/, 'Letters, digits and . _ @ - only'),
      name: z.string().trim().min(2).max(150),
      email: z.string().trim().email().max(200).nullable().optional(),
      phone: z.string().trim().max(20).nullable().optional(),
      password: passwordSchema.optional(),
      memberships: z.array(membershipInput).min(1).max(10),
    })
    .parse(req.body);

  const password = body.password ?? temporaryPassword();
  const user = await withTenant(ctx.organizationId, async (tx) => {
    const memberships = [];
    for (const m of body.memberships) memberships.push(await resolveMembership(tx, ctx.access, m));
    const created = await tx.user.create({
      data: {
        organizationId: ctx.organizationId,
        username: body.username,
        name: body.name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        passwordHash: await bcrypt.hash(password, PASSWORD_ROUNDS),
        mustChangePassword: true,
      },
    });
    for (const m of memberships) await tx.membership.create({ data: { ...m, organizationId: ctx.organizationId, userId: created.id } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'User', entityId: created.id, after: { username: body.username, name: body.name, memberships } });
    return tx.user.findUniqueOrThrow({ where: { id: created.id }, select: userSelect });
  });
  res.status(201).json({ ...user, temporaryPassword: body.password ? undefined : password });
});

/** PATCH /users/:id — { name?, email?, phone?, isActive? }. Disabling also signs the user out. */
usersRouter.patch('/users/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = z
    .object({
      name: z.string().trim().min(2).max(150).optional(),
      email: z.string().trim().email().max(200).nullable().optional(),
      phone: z.string().trim().max(20).nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);
  if (id === ctx.userId && body.isActive === false) throw badRequest('You cannot disable your own account.');

  const user = await withTenant(ctx.organizationId, async (tx) => {
    const before = await manageableUser(tx, ctx.access, id);
    await tx.user.update({ where: { id }, data: body });
    if (body.isActive === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'User', entityId: id, before: { name: before.name, email: before.email, phone: before.phone, isActive: before.isActive }, after: body });
    return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  });
  res.json(user);
});

/** POST /users/:id/reset-password — returns a one-time temporary password. */
usersRouter.post('/users/:id/reset-password', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  if (id === ctx.userId) throw badRequest('Use change password for your own account.');
  const password = temporaryPassword();
  await withTenant(ctx.organizationId, async (tx) => {
    await manageableUser(tx, ctx.access, id);
    await tx.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, PASSWORD_ROUNDS), mustChangePassword: true } });
    await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'User', entityId: id, after: { passwordReset: true } });
  });
  res.json({ temporaryPassword: password });
});

/** POST /users/:id/memberships — add one role. */
usersRouter.post('/users/:id/memberships', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  if (id === ctx.userId) throw badRequest('You cannot change your own roles.');
  const input = membershipInput.parse(req.body);
  const user = await withTenant(ctx.organizationId, async (tx) => {
    await manageableUser(tx, ctx.access, id);
    const m = await resolveMembership(tx, ctx.access, input);
    const duplicate = await tx.membership.findFirst({ where: { userId: id, isActive: true, roleId: m.roleId, regionId: m.regionId, branchId: m.branchId } });
    if (duplicate) throw new AppError(409, 'CONFLICT', 'The user already has this role here.');
    const created = await tx.membership.create({ data: { ...m, organizationId: ctx.organizationId, userId: id } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Membership', entityId: created.id, branchId: m.branchId, after: m });
    return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  });
  res.status(201).json(user);
});

/** DELETE /users/:id/memberships/:membershipId — removes one role (kept inactive for history). */
usersRouter.delete('/users/:id/memberships/:membershipId', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const membershipId = idParam(req, 'membershipId');
  if (id === ctx.userId) throw badRequest('You cannot change your own roles.');
  await withTenant(ctx.organizationId, async (tx) => {
    const m = await tx.membership.findFirst({ where: { id: membershipId, userId: id, isActive: true } });
    if (!m || !canManageScope(ctx.access, m)) throw notFound('Membership');
    await tx.membership.update({ where: { id: membershipId }, data: { isActive: false } });
    await audit(tx, ctx, { action: 'DELETE', entity: 'Membership', entityId: membershipId, branchId: m.branchId, before: m });
  });
  res.status(204).end();
});

// ── Roles ────────────────────────────────────────────────────────────────────

const roleSelect = { id: true, code: true, name: true, level: true, isSystem: true, permissions: { select: { permissionCode: true } } } as const;
const roleOut = (r: { permissions: { permissionCode: string }[] } & Record<string, unknown>) => ({
  ...r,
  permissions: r.permissions.map((p) => p.permissionCode).sort(),
});

/** GET /roles — built-in roles plus this organization's custom roles. */
usersRouter.get('/roles', async (req, res) => {
  const ctx = ctxOf(req);
  const roles = await withTenant(ctx.organizationId, (tx) => tx.role.findMany({ select: roleSelect, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }));
  res.json(roles.map(roleOut));
});

/** GET /permissions — every permission code, grouped by module in the UI. */
usersRouter.get('/permissions', async (req, res) => {
  const ctx = ctxOf(req);
  res.json(await withTenant(ctx.organizationId, (tx) => tx.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] })));
});

const permissionList = z.array(z.string().trim().max(60)).max(100);

async function assertPermissionsExist(tx: Tx, codes: string[]) {
  const found = await tx.permission.findMany({ where: { code: { in: codes } }, select: { code: true } });
  const missing = codes.filter((c) => !found.some((f) => f.code === c));
  if (missing.length) throw badRequest(`Unknown permissions: ${missing.join(', ')}`);
}

/** POST /roles — custom role for this organization. Needs organization-level users.manage. */
usersRouter.post('/roles', requireOrg('users.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const body = z
    .object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,39}$/, 'Like ADMISSIONS_HEAD'),
      name: z.string().trim().min(2).max(100),
      level: z.enum(['ORG', 'REGION', 'BRANCH']),
      permissions: permissionList,
    })
    .parse(req.body);
  const codes = [...new Set(body.permissions)];

  const role = await withTenant(ctx.organizationId, async (tx) => {
    if (await tx.role.findFirst({ where: { code: body.code } })) throw new AppError(409, 'CONFLICT', 'A role with this code already exists.');
    await assertPermissionsExist(tx, codes);
    const created = await tx.role.create({ data: { organizationId: ctx.organizationId, code: body.code, name: body.name, level: body.level, isSystem: false } });
    for (const code of codes) await tx.rolePermission.create({ data: { organizationId: ctx.organizationId, roleId: created.id, permissionCode: code } });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Role', entityId: created.id, after: { ...body, permissions: codes } });
    return tx.role.findUniqueOrThrow({ where: { id: created.id }, select: roleSelect });
  });
  res.status(201).json(roleOut(role));
});

/** PUT /roles/:id/permissions — replace a custom role's permissions. Built-in roles cannot be changed. */
usersRouter.put('/roles/:id/permissions', requireOrg('users.manage'), async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const codes = [...new Set(z.object({ permissions: permissionList }).parse(req.body).permissions)];
  const role = await withTenant(ctx.organizationId, async (tx) => {
    const existing = await tx.role.findUnique({ where: { id }, select: roleSelect });
    if (!existing) throw notFound('Role');
    if (existing.isSystem) throw forbidden('Built-in roles cannot be changed. Create a custom role instead.');
    await assertPermissionsExist(tx, codes);
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    for (const code of codes) await tx.rolePermission.create({ data: { organizationId: ctx.organizationId, roleId: id, permissionCode: code } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Role', entityId: id, before: roleOut(existing).permissions, after: codes });
    return tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect });
  });
  res.json(roleOut(role));
});
