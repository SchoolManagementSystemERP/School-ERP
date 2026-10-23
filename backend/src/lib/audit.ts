import type { Tx } from '../db/prisma.js';
import type { RequestContext } from '../auth/access.js';

/** Writes one AuditLog row inside the caller's transaction. */
export async function audit(
  tx: Tx,
  ctx: RequestContext,
  entry: { action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT'; entity: string; entityId?: string; branchId?: string | null; before?: unknown; after?: unknown },
) {
  await tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      branchId: entry.branchId ?? null,
      userId: ctx.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
      ip: ctx.ip,
    },
  });
}
