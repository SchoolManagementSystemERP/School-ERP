/**
 * Staff (teachers and non-teaching employees).
 *  - staff.read: full records of the branch's staff; Aadhaar, PAN and bank details only with staff.write.
 *  - everyone else signed in: the directory (name, department, subjects, class-teacher-of) — no salary or personal data.
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { targetBranch, type RequestContext } from '../../auth/access.js';
import { withTenant } from '../../db/prisma.js';
import { audit } from '../../lib/audit.js';
import { decryptJson, encryptJson, mergeEncrypted } from '../../lib/crypto.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, parseJson, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { PASSWORD_ROUNDS } from '../auth/auth.routes.js';

export const staffRouter = Router();

/** Profile keys anyone in the school may see (the staff directory). */
const DIRECTORY_KEYS = ['positions', 'classSubjects', 'classTeacherOf', 'highestQualification', 'experience', 'initials', 'medium', 'reportingTo'];

type StaffRow = {
  id: string; branchId: string; userId: string | null; employeeCode: string; name: string; gender: string | null; dob: Date | null; phone: string | null; email: string | null;
  staffType: string; designation: string; department: string | null; employmentType: string | null; joiningDate: Date | null; status: string;
  basicSalary: unknown; allowances: string | null; bankAccount: string | null; sensitive: string | null; profile: string | null;
};

function staffOut(s: StaffRow, level: 'directory' | 'full' | 'sensitive') {
  const profile = (parseJson(s.profile) ?? {}) as Record<string, unknown>;
  const base = {
    id: s.id, branchId: s.branchId, employeeCode: s.employeeCode, name: s.name, gender: s.gender, staffType: s.staffType, designation: s.designation,
    department: s.department, status: s.status, hasLogin: !!s.userId,
  };
  if (level === 'directory') return { ...base, profile: Object.fromEntries(DIRECTORY_KEYS.filter((k) => k in profile).map((k) => [k, profile[k]])) };
  return {
    ...base, dob: toDateString(s.dob), phone: s.phone, email: s.email, employmentType: s.employmentType, joiningDate: toDateString(s.joiningDate),
    basicSalary: s.basicSalary == null ? null : Number(s.basicSalary), allowances: parseJson(s.allowances), profile,
    ...(level === 'sensitive' ? { sensitive: decryptJson(s.sensitive), bank: decryptJson(s.bankAccount) } : {}),
  };
}

const levelFor = (ctx: RequestContext, branchId: string) =>
  ctx.access.can('staff.write', branchId) ? 'sensitive' : ctx.access.can('staff.read', branchId) ? 'full' : 'directory';

/** GET /staff?type=TEACHING|NON_TEACHING|ALL&status=ACTIVE|ALL */
staffRouter.get('/staff', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ type: z.enum(['TEACHING', 'NON_TEACHING', 'ALL']).default('ALL'), status: z.enum(['CURRENT', 'ALL']).default('CURRENT') }).parse(req.query);
  const branchIds = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.access.branchesWith();
  if (!branchIds.length) throw forbidden();
  const rows = await withTenant(ctx.organizationId, (tx) =>
    tx.staff.findMany({
      where: { branchId: { in: branchIds }, ...(q.type === 'ALL' ? {} : { staffType: q.type }), ...(q.status === 'ALL' ? {} : { status: { not: 'RESIGNED' } }) },
      orderBy: { employeeCode: 'asc' },
    }),
  );
  res.json(rows.map((s) => staffOut(s as StaffRow, levelFor(ctx, s.branchId))));
});

const staffInput = z.object({
  branchId: z.string().uuid().optional(),
  employeeCode: z.string().trim().regex(/^[A-Za-z0-9-]{2,30}$/),
  name: z.string().trim().min(2).max(150),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  dob: dateOnly.nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal('')),
  staffType: z.enum(['TEACHING', 'NON_TEACHING']),
  designation: z.string().trim().min(2).max(100),
  department: z.string().trim().max(100).nullable().optional(),
  employmentType: z.enum(['PERMANENT', 'PROBATION', 'CONTRACT', 'PART_TIME', 'GUEST']).nullable().optional(),
  joiningDate: dateOnly.nullable().optional(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED']).default('ACTIVE'),
  basicSalary: z.number().min(0).max(10_000_000).nullable().optional(),
  allowances: z.record(z.number().min(0).nullable()).nullable().optional(),
  profile: z.record(z.unknown()).nullable().optional(),
  /** Aadhaar / PAN — stored encrypted. */
  sensitive: z.object({ aadhaar: z.string().regex(/^\d{12}$/).nullable().optional(), pan: z.string().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/).nullable().optional() }).partial().optional(),
  bank: z.object({ bankName: z.string().max(100).optional(), accountNo: z.string().max(30).optional(), ifsc: z.string().max(11).optional(), branch: z.string().max(100).optional(), type: z.string().max(30).optional() }).optional(),
  /** Create a sign-in for a teacher (username = employee code); the temporary password is returned once. */
  createLogin: z.boolean().default(false),
});

const json = (v: unknown) => (v === undefined ? undefined : v === null ? null : JSON.stringify(v));

/** POST /staff — needs staff.write in the branch. */
staffRouter.post('/staff', async (req, res) => {
  const ctx = ctxOf(req);
  const body = staffInput.parse(req.body);
  const branchId = targetBranch(ctx, 'staff.write', body.branchId);
  const { sensitive, bank, createLogin, allowances, profile, ...cols } = body;
  const result = await withTenant(ctx.organizationId, async (tx) => {
    if (await tx.staff.findFirst({ where: { employeeCode: body.employeeCode } })) throw conflict(`Employee code ${body.employeeCode} is already used.`);
    let userId: string | null = null;
    let temporaryPassword: string | undefined;
    if (createLogin) {
      if (await tx.user.findFirst({ where: { username: body.employeeCode } })) throw conflict(`Username ${body.employeeCode} is already in use.`);
      const role = await tx.role.findFirstOrThrow({ where: { code: body.staffType === 'TEACHING' ? 'TEACHER' : 'RECEPTIONIST', organizationId: null } });
      temporaryPassword = `Erp${randomBytes(5).toString('hex')}7`;
      const user = await tx.user.create({ data: { organizationId: ctx.organizationId, username: body.employeeCode, name: body.name, email: body.email || null, phone: body.phone ?? null, passwordHash: await bcrypt.hash(temporaryPassword, PASSWORD_ROUNDS), mustChangePassword: true } });
      await tx.membership.create({ data: { organizationId: ctx.organizationId, userId: user.id, roleId: role.id, scopeType: 'BRANCH', branchId } });
      userId = user.id;
    }
    const created = await tx.staff.create({
      data: {
        ...cols, email: cols.email || null, organizationId: ctx.organizationId, branchId, userId, basicSalary: cols.basicSalary ?? null, allowances: json(allowances), profile: json(profile),
        sensitive: sensitive ? encryptJson(sensitive) : null, bankAccount: bank && Object.values(bank).some(Boolean) ? encryptJson(bank) : null,
      },
    });
    await audit(tx, ctx, { action: 'CREATE', entity: 'Staff', entityId: created.id, branchId, after: { ...cols, sensitive: sensitive ? 'set' : undefined, bank: bank ? 'set' : undefined } });
    return { staff: staffOut(created as StaffRow, 'sensitive'), temporaryPassword };
  });
  res.status(201).json({ ...result.staff, temporaryPassword: result.temporaryPassword });
});

/** PATCH /staff/:id — needs staff.write in the staff member's branch. */
staffRouter.patch('/staff/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = staffInput.omit({ createLogin: true, branchId: true }).partial().parse(req.body);
  const { sensitive, bank, allowances, profile, ...cols } = body;
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.staff.findUnique({ where: { id } });
    if (!before) throw notFound('Staff member');
    if (!ctx.access.can('staff.write', before.branchId)) throw forbidden();
    if (cols.employeeCode && cols.employeeCode !== before.employeeCode && (await tx.staff.findFirst({ where: { employeeCode: cols.employeeCode } }))) throw conflict(`Employee code ${cols.employeeCode} is already used.`);
    const updated = await tx.staff.update({
      where: { id },
      data: {
        ...cols, ...(cols.email !== undefined ? { email: cols.email || null } : {}), allowances: json(allowances), profile: json(profile),
        ...(sensitive ? { sensitive: mergeEncrypted(before.sensitive, sensitive) } : {}),
        ...(bank ? { bankAccount: mergeEncrypted(before.bankAccount, bank) } : {}),
      },
    });
    if (cols.status === 'RESIGNED' && before.userId) await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
    await audit(tx, ctx, { action: 'UPDATE', entity: 'Staff', entityId: id, branchId: before.branchId, before: { ...before, sensitive: undefined, bankAccount: undefined }, after: { ...cols, sensitive: sensitive ? 'changed' : undefined, bank: bank ? 'changed' : undefined } });
    return updated;
  });
  res.json(staffOut(out as StaffRow, 'sensitive'));
});
