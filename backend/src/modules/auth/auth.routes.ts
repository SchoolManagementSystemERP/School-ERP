import bcrypt from 'bcryptjs';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { hashRefreshToken, newRefreshToken, signAccessToken, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from '../../auth/tokens.js';
import { env } from '../../config/env.js';
import { withSystem, withTenant, type Tx } from '../../db/prisma.js';
import { AppError, unauthorized } from '../../lib/errors.js';
import { clientIp } from '../../lib/http.js';
import { authenticate, ctxOf } from '../../middleware/authenticate.js';

export const PASSWORD_ROUNDS = 12;
const REFRESH_COOKIE = 'erp_rt';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

/** Compared against when the username does not exist, so both cases take the same time. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', PASSWORD_ROUNDS);

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/\d/, 'Must contain a number');

const loginSchema = z.object({
  organization: z.string().trim().toLowerCase().min(1).max(60), // subdomain, e.g. "dav"
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

const tooMany = { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Try again in 15 minutes.' };
/** Guessing one account's password: 10 tries per 15 minutes per account and address. */
const accountLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // ipKeyGenerator groups an IPv6 address by its /56 subnet, so one client cannot rotate addresses
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.organization ?? '').toLowerCase()}|${String(req.body?.username ?? '').toLowerCase()}`,
  message: tooMany,
});
/** Many accounts from one address (a whole school may share one internet connection, so this is generous). */
const ipLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false, message: tooMany });

async function issueTokens(res: Response, req: Request, userId: string, organizationId: string, tx: Tx) {
  const refresh = newRefreshToken();
  await tx.refreshToken.create({
    data: { userId, tokenHash: refresh.hash, expiresAt: refresh.expiresAt, userAgent: req.get('user-agent')?.slice(0, 300) ?? null },
  });
  res.cookie(REFRESH_COOKIE, refresh.token, cookieOptions);
  return { accessToken: signAccessToken(userId, organizationId), expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export const authRouter = Router();

/** POST /auth/login — { organization, username, password } → access token (+ refresh cookie). */
authRouter.post('/login', ipLimiter, accountLimiter, async (req, res) => {
  const body = loginSchema.parse(req.body);
  const failed = new AppError(401, 'INVALID_LOGIN', 'Wrong organization, username or password.');

  const result = await withSystem(async (tx) => {
    const org = await tx.organization.findUnique({ where: { subdomain: body.organization }, select: { id: true, status: true } });
    const user = org
      ? await tx.user.findUnique({
          where: { organizationId_username: { organizationId: org.id, username: body.username } },
          select: { id: true, name: true, passwordHash: true, isActive: true, mustChangePassword: true, _count: { select: { memberships: { where: { isActive: true } } } } },
        })
      : null;

    const passwordOk = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!org || !user || !passwordOk) throw failed;
    if (!user.isActive || user._count.memberships === 0) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact your school office.');
    if (org.status === 'SUSPENDED' || org.status === 'CANCELLED') throw new AppError(403, 'ORG_INACTIVE', 'This organization’s subscription is not active.');

    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await tx.auditLog.create({
      data: { organizationId: org.id, userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ip: clientIp(req) },
    });
    const tokens = await issueTokens(res, req, user.id, org.id, tx);
    return { ...tokens, user: { id: user.id, name: user.name, mustChangePassword: user.mustChangePassword } };
  });

  res.json(result);
});

/** POST /auth/refresh — rotates the refresh cookie and returns a new access token. */
authRouter.post('/refresh', async (req, res) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== 'string' || !token) throw unauthorized();
  const hash = hashRefreshToken(token);

  const result = await withSystem(async (tx) => {
    const stored = await tx.refreshToken.findFirst({
      where: { tokenHash: hash },
      select: { id: true, userId: true, expiresAt: true, revokedAt: true, user: { select: { organizationId: true, isActive: true } } },
    });
    if (!stored) return null;
    if (stored.revokedAt) {
      // A token that was already rotated is being reused: assume it was stolen and sign the user out everywhere.
      await tx.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return null;
    }
    if (stored.expiresAt < new Date() || !stored.user.isActive) return null;
    await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return issueTokens(res, req, stored.userId, stored.user.organizationId, tx);
  });

  if (!result) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
    throw unauthorized();
  }
  res.json(result);
});

/** POST /auth/logout — revokes the refresh cookie. */
authRouter.post('/logout', async (req, res) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token === 'string' && token) {
    await withSystem((tx) => tx.refreshToken.updateMany({ where: { tokenHash: hashRefreshToken(token), revokedAt: null }, data: { revokedAt: new Date() } }));
  }
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

/** POST /auth/change-password — also signs out every other session. */
authRouter.post('/change-password', authenticate, async (req, res) => {
  const ctx = ctxOf(req);
  const body = changePasswordSchema.parse(req.body);
  if (body.currentPassword === body.newPassword) throw new AppError(400, 'BAD_REQUEST', 'The new password must be different.');

  const result = await withTenant(ctx.organizationId, async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { passwordHash: true } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new AppError(400, 'WRONG_PASSWORD', 'Current password is wrong.');
    }
    await tx.user.update({
      where: { id: ctx.userId },
      data: { passwordHash: await bcrypt.hash(body.newPassword, PASSWORD_ROUNDS), mustChangePassword: false },
    });
    await tx.refreshToken.updateMany({ where: { userId: ctx.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return issueTokens(res, req, ctx.userId, ctx.organizationId, tx);
  });
  res.json(result);
});
