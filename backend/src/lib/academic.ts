import type { Tx } from '../db/prisma.js';
import { conflict } from './errors.js';

/** Current academic year of the organization; 409 if none is marked current. */
export async function currentYear(tx: Tx) {
  const year = await tx.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true, name: true, startDate: true } });
  if (!year) throw conflict('No current academic year is set.');
  return year;
}
