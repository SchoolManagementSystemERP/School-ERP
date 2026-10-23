import type { RequestContext } from '../auth/access.js';
import type { Tx } from '../db/prisma.js';
import { forbidden } from './errors.js';

/**
 * Who a read covers. Staff see the branches where they hold the read permission (the X-Branch-Id
 * branch when sent); students and parents see only their own / their children's records.
 */
export type Scope =
  | { kind: 'staff'; branchIds: string[] }
  | { kind: 'self'; branchIds: string[]; studentIds: string[]; sectionIds: string[] };

/** Branches the user may read with `permission`, or — for students and parents — their linked students. */
export async function readScope(tx: Tx, ctx: RequestContext, permission: string, yearId: string): Promise<Scope> {
  const branchIds = ctx.activeBranchId
    ? ctx.access.can(permission, ctx.activeBranchId) ? [ctx.activeBranchId] : []
    : ctx.access.branchesWith(permission);
  if (branchIds.length) return { kind: 'staff', branchIds };

  const students = await tx.student.findMany({
    where: { OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] },
    select: { id: true, branchId: true },
  });
  if (!students.length) throw forbidden();
  const enrollments = await tx.enrollment.findMany({
    where: { academicYearId: yearId, studentId: { in: students.map((s) => s.id) } },
    select: { sectionId: true },
  });
  return {
    kind: 'self',
    branchIds: [...new Set(students.map((s) => s.branchId))],
    studentIds: students.map((s) => s.id),
    sectionIds: [...new Set(enrollments.map((e) => e.sectionId))],
  };
}

/** Branches where the user has any role (lists everyone in the branch may see, like the class list). */
export function memberBranches(ctx: RequestContext) {
  const ids = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.access.branchesWith();
  if (!ids.length || (ctx.activeBranchId && !ctx.access.branchesWith().includes(ctx.activeBranchId))) throw forbidden();
  return ids;
}

