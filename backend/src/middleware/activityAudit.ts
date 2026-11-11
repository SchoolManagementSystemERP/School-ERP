import type { NextFunction, Request, Response } from 'express';
import { hasAuditRecord } from '../lib/audit.js';
import { withTenant } from '../db/prisma.js';
import { ctxOf } from './authenticate.js';

const ACTION_BY_METHOD: Record<string, 'CREATE' | 'UPDATE' | 'DELETE' | 'READ' | 'ACTION'> = {
  GET: 'READ',
  HEAD: 'READ',
  POST: 'ACTION',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

function requestBranch(req: Request, ctx: ReturnType<typeof ctxOf>) {
  if (ctx.activeBranchId) return ctx.activeBranchId;
  const bodyBranchId = typeof req.body?.branchId === 'string' ? req.body.branchId.toLowerCase() : null;
  if (bodyBranchId && ctx.access.branchPermissions.has(bodyBranchId)) return bodyBranchId;
  const paramBranchId = Object.values(req.params).find(
    (value): value is string => typeof value === 'string' && ctx.access.branchPermissions.has(value.toLowerCase()),
  );
  if (paramBranchId) return paramBranchId.toLowerCase();
  const branches = ctx.access.branchesWith();
  return branches.length === 1 ? branches[0] : null;
}

/** Records successful authenticated API activity not already captured by a domain audit entry. */
export function activityAudit(req: Request, res: Response, next: NextFunction) {
  const ctx = ctxOf(req);
  const action = ACTION_BY_METHOD[req.method];
  if (!action || req.path === '/audit-log') {
    next();
    return;
  }

  const originalEnd = res.end.bind(res);
  let endStarted = false;
  let auditFailed = false;

  res.end = ((...args: Parameters<Response['end']>) => {
    if (auditFailed) {
      return originalEnd(...args);
    }
    if (endStarted) return res;
    if (res.statusCode < 200 || res.statusCode >= 400) return originalEnd(...args);

    endStarted = true;
    const responseArgs = args;
    void (async () => {
      if (!hasAuditRecord(ctx)) {
        const routePath = typeof req.route?.path === 'string' ? req.route.path : req.path;
        const entity = `${req.method} ${routePath}`.slice(0, 60);
        const entityId = Object.entries(req.params).find(
          (entry): entry is [string, string] => /id$/i.test(entry[0])
            && typeof entry[1] === 'string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry[1]),
        )?.[1];
        const branchId = requestBranch(req, ctx);
        await withTenant(ctx.organizationId, async (tx) => {
          await tx.auditLog.create({
            data: {
              organizationId: ctx.organizationId,
              branchId,
              userId: ctx.userId,
              action,
              entity,
              entityId,
              ip: ctx.ip,
              after: JSON.stringify({ method: req.method, path: routePath, statusCode: res.statusCode }),
            },
          });
        });
      }
      originalEnd(...responseArgs);
    })().catch((error: unknown) => {
      console.error('Failed to write API activity audit record:', error);
      auditFailed = true;
      endStarted = false;
      if (res.headersSent) {
        originalEnd(...responseArgs);
        return;
      }
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.removeHeader('content-length');
      originalEnd(JSON.stringify({ error: 'AUDIT_LOG_FAILED', message: 'The activity could not be recorded.' }));
    });

    return res;
  }) as Response['end'];

  next();
}
