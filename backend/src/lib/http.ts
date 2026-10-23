import type { Request } from 'express';
import { z } from 'zod';
import { notFound } from './errors.js';

const uuid = z.string().uuid();

/** Validated route parameter that must be a GUID (anything else is simply "not found"). */
export function idParam(req: Request, name = 'id'): string {
  const parsed = uuid.safeParse(req.params[name]);
  if (!parsed.success) throw notFound();
  return parsed.data.toLowerCase();
}

export const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** "YYYY-MM-DD" ⇄ Date for DATE columns (kept in UTC so the day never shifts). */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00Z`));

export const toDateString = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const clientIp = (req: Request) => (req.ip ?? '').slice(0, 45) || null;
