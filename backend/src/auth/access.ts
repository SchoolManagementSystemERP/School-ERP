import type { Tx } from '../db/prisma.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';

export type BranchInfo = { id: string; code: string; name: string; regionId: string | null };

export type MembershipInfo = {
  id: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  scopeType: 'ORG' | 'REGION' | 'BRANCH';
  regionId: string | null;
  branchId: string | null;
};

/**
 * What the signed-in user may do, worked out from their active memberships:
 * an ORG membership applies to every branch, a REGION membership to the branches in that
 * region, a BRANCH membership to that branch only.
 */
export class Access {
  /** Permissions held at organization level (ORG memberships only). */
  readonly orgPermissions: Set<string>;
  /** Permissions per branch id. Branches the user has no role in are absent. */
  readonly branchPermissions: Map<string, Set<string>>;

  constructor(
    readonly memberships: MembershipInfo[],
    rolePermissions: Map<string, string[]>,
    readonly branches: BranchInfo[],
  ) {
    this.orgPermissions = new Set();
    this.branchPermissions = new Map();
    for (const m of memberships) {
      const perms = rolePermissions.get(m.roleId) ?? [];
      if (m.scopeType === 'ORG') perms.forEach((p) => this.orgPermissions.add(p));
      for (const b of branches) {
        const covered =
          m.scopeType === 'ORG' ||
          (m.scopeType === 'REGION' && m.regionId !== null && b.regionId === m.regionId) ||
          (m.scopeType === 'BRANCH' && b.id === m.branchId);
        if (!covered) continue;
        let set = this.branchPermissions.get(b.id);
        if (!set) this.branchPermissions.set(b.id, (set = new Set()));
        perms.forEach((p) => set!.add(p));
      }
    }
  }

  /** Organization-level permission (e.g. org.manage), or a branch permission when `branchId` is given. */
  can(permission: string, branchId?: string | null): boolean {
    if (branchId) return this.branchPermissions.get(branchId.toLowerCase())?.has(permission) ?? false;
    return this.orgPermissions.has(permission);
  }

  /** Branch ids where the user holds `permission` (or any role at all, when omitted). */
  branchesWith(permission?: string): string[] {
    return [...this.branchPermissions.entries()].filter(([, p]) => !permission || p.has(permission)).map(([id]) => id);
  }

  canAnywhere(permission: string): boolean {
    return this.orgPermissions.has(permission) || this.branchesWith(permission).length > 0;
  }
}

export type RequestContext = {
  userId: string;
  organizationId: string;
  username: string;
  name: string;
  mustChangePassword: boolean;
  access: Access;
  ip: string | null;
  /** Value of the X-Branch-Id header (lower-case), if sent. */
  activeBranchId: string | null;
};

/** Loads the user's memberships and permissions. Fails if the user or organization is disabled. */
export async function loadAccess(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      username: true,
      name: true,
      isActive: true,
      mustChangePassword: true,
      organization: { select: { status: true } },
      memberships: {
        where: { isActive: true },
        select: {
          id: true,
          roleId: true,
          scopeType: true,
          regionId: true,
          branchId: true,
          role: { select: { code: true, name: true, permissions: { select: { permissionCode: true } } } },
        },
      },
    },
  });
  if (!user || !user.isActive) throw unauthorized('This account is disabled or no longer exists.');
  if (user.organization.status === 'SUSPENDED' || user.organization.status === 'CANCELLED') {
    throw forbidden('This organization’s subscription is not active.');
  }

  const branches = await tx.branch.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, regionId: true },
    orderBy: { name: 'asc' },
  });

  const rolePermissions = new Map(user.memberships.map((m) => [m.roleId, m.role.permissions.map((p) => p.permissionCode)]));
  const memberships: MembershipInfo[] = user.memberships.map((m) => ({
    id: m.id,
    roleId: m.roleId,
    roleCode: m.role.code,
    roleName: m.role.name,
    scopeType: m.scopeType as MembershipInfo['scopeType'],
    regionId: m.regionId,
    branchId: m.branchId,
  }));

  return { user, access: new Access(memberships, rolePermissions, branches) };
}

/**
 * Branches a request works on for `permission`: the X-Branch-Id branch if sent (403 if the user
 * lacks the permission there), otherwise every branch where the user has it.
 */
export function scopeBranches(ctx: RequestContext, permission: string): string[] {
  if (ctx.activeBranchId) {
    if (!ctx.access.can(permission, ctx.activeBranchId)) throw forbidden();
    return [ctx.activeBranchId];
  }
  const ids = ctx.access.branchesWith(permission);
  if (ids.length === 0) throw forbidden();
  return ids;
}

/** One branch for creating records: the X-Branch-Id branch, an explicit one, or the user's only branch. */
export function targetBranch(ctx: RequestContext, permission: string, explicit?: string | null): string {
  const id = (explicit ?? ctx.activeBranchId)?.toLowerCase();
  if (id) {
    if (!ctx.access.can(permission, id)) throw forbidden();
    return id;
  }
  const ids = ctx.access.branchesWith(permission);
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw forbidden();
  throw new AppError(400, 'BRANCH_REQUIRED', 'Choose a branch (send the X-Branch-Id header).');
}
