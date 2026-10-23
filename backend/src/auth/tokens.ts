import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

const ISSUER = 'school-erp-api';

type AccessPayload = { sub: string; org: string };

export function signAccessToken(userId: string, organizationId: string): string {
  return jwt.sign({ org: organizationId } satisfies Omit<AccessPayload, 'sub'>, env.JWT_SECRET, {
    subject: userId,
    issuer: ISSUER,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** Returns the payload, or null if the token is invalid or expired. */
export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.org !== 'string') return null;
    return { sub: payload.sub, org: payload.org };
  } catch {
    return null;
  }
}

/** Opaque refresh token: the client keeps the token, the database keeps only its SHA-256 hash. */
export function newRefreshToken() {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token), expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000) };
}

export const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');
