import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { loadAccess, type RequestContext } from '../auth/access.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { withTenant } from '../db/prisma.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { clientIp } from '../lib/http.js';

const branchHeader = z.string().uuid();

/** Paths a user who must change their password may still call. */
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/v1/me', '/api/v1/auth/change-password', '/api/v1/auth/logout']);

/** Verifies the Bearer token, loads the user's permissions and puts them on `req.ctx`. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) throw unauthorized();

  let activeBranchId: string | null = null;
  const rawBranch = req.headers['x-branch-id'];
  if (typeof rawBranch === 'string' && rawBranch !== '') {
    const parsed = branchHeader.safeParse(rawBranch);
    if (!parsed.success) throw new AppError(400, 'BAD_REQUEST', 'X-Branch-Id must be a branch id.');
    activeBranchId = parsed.data.toLowerCase();
  }

  const { user, access } = await withTenant(payload.org, (tx) => loadAccess(tx, payload.sub));
  if (user.organizationId !== payload.org) throw unauthorized();
  if (activeBranchId && !access.branchPermissions.has(activeBranchId)) throw forbidden('You have no role in this branch.');

  if (user.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(req.baseUrl + req.path)) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please change your password first.');
  }

  req.ctx = {
    userId: user.id,
    organizationId: user.organizationId,
    username: user.username,
    name: user.name,
    mustChangePassword: user.mustChangePassword,
    access,
    ip: clientIp(req),
    activeBranchId,
  } satisfies RequestContext;
  next();
}

export function ctxOf(req: Request): RequestContext {
  if (!req.ctx) throw unauthorized();
  return req.ctx;
}

/** Route guard: the user needs `permission` in at least one branch, or at organization level. */
export const requireAnywhere = (permission: string) => (req: Request, _res: Response, next: NextFunction) => {
  if (!ctxOf(req).access.canAnywhere(permission)) throw forbidden();
  next();
};

/** Route guard: organization-level permission (ORG membership). */
export const requireOrg = (permission: string) => (req: Request, _res: Response, next: NextFunction) => {
  if (!ctxOf(req).access.can(permission)) throw forbidden();
  next();
};
