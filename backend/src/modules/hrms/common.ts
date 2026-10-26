import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { RequestContext } from '../../auth/access.js';
import type { Tx } from '../../db/prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { PASSWORD_ROUNDS } from '../auth/auth.routes.js';

/** HR work (recruitment, onboarding, training, exits) needs staff.write in the branch. */
export const canManageHr = (ctx: RequestContext, branchId: string) => ctx.access.can('staff.write', branchId);
/** Approvals (claims, attendance corrections) — principals and HR (leave.approve). */
export const canApprove = (ctx: RequestContext, branchId: string) => ctx.access.can('leave.approve', branchId) || ctx.access.can('staff.write', branchId);

export function assertHr(ctx: RequestContext, branchId: string) {
  if (!canManageHr(ctx, branchId)) throw forbidden();
}

/** Branches where the user does HR work (the X-Branch-Id branch when sent). */
export function hrBranches(ctx: RequestContext, also?: (b: string) => boolean) {
  const ok = (b: string) => canManageHr(ctx, b) || (also?.(b) ?? false);
  return ctx.activeBranchId ? (ok(ctx.activeBranchId) ? [ctx.activeBranchId] : []) : ctx.access.branchesWith().filter(ok);
}

/** The signed-in person's own staff record. */
export async function ownStaff(tx: Tx, ctx: RequestContext) {
  return tx.staff.findFirst({ where: { userId: ctx.userId }, select: { id: true, branchId: true, name: true, employeeCode: true, status: true } });
}

export async function staffOrThrow(tx: Tx, id: string) {
  const s = await tx.staff.findUnique({ where: { id } });
  if (!s) throw notFound('Staff member');
  return s;
}

/** Financial year code "26-27" (April–March). */
export function fyCode(d = new Date()) {
  const start = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

/** Next document number like "OFR/26-27/0001" for a table with organizationId + a number column. */
export async function nextDocNo(prefix: string, count: (startsWith: string) => Promise<number>) {
  const start = `${prefix}/${fyCode()}/`;
  return `${start}${String((await count(start)) + 1).padStart(4, '0')}`;
}

/** Next employee code in a series: T007 for teachers, S013 for other staff. */
export async function nextEmployeeCode(tx: Tx, staffType: string) {
  const prefix = staffType === 'TEACHING' ? 'T' : 'S';
  const codes = await tx.staff.findMany({ where: { employeeCode: { startsWith: prefix } }, select: { employeeCode: true } });
  const max = codes.reduce((m, c) => Math.max(m, Number(c.employeeCode.slice(1)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Creates a sign-in with a one-time password for an employee; returns the password. */
export async function createStaffLogin(tx: Tx, ctx: RequestContext, p: { username: string; name: string; email: string | null; phone: string | null; branchId: string; roleCode: string }) {
  const role = await tx.role.findFirst({ where: { code: p.roleCode, OR: [{ organizationId: null }, { organizationId: ctx.organizationId }] } });
  if (!role) throw notFound('Role');
  const temporaryPassword = `Erp${randomBytes(5).toString('hex')}7`;
  const user = await tx.user.create({
    data: { organizationId: ctx.organizationId, username: p.username, name: p.name, email: p.email, phone: p.phone, passwordHash: await bcrypt.hash(temporaryPassword, PASSWORD_ROUNDS), mustChangePassword: true },
  });
  await tx.membership.create({ data: { organizationId: ctx.organizationId, userId: user.id, roleId: role.id, scopeType: 'BRANCH', branchId: p.branchId } });
  return { userId: user.id, temporaryPassword };
}

/** The joining checklist every new employee gets. */
export const ONBOARDING_TASKS: { key: string; title: string; category: string; teachingOnly?: boolean }[] = [
  { key: 'offer_signed', title: 'Signed offer letter received', category: 'DOCUMENTS' },
  { key: 'id_proof', title: 'ID proof (Aadhaar) collected', category: 'DOCUMENTS' },
  { key: 'pan', title: 'PAN card collected', category: 'DOCUMENTS' },
  { key: 'education', title: 'Educational certificates verified', category: 'DOCUMENTS' },
  { key: 'experience', title: 'Previous experience / relieving letters', category: 'DOCUMENTS' },
  { key: 'photos', title: 'Passport-size photographs', category: 'DOCUMENTS' },
  { key: 'bank', title: 'Bank account details for salary', category: 'PAYROLL' },
  { key: 'bgv', title: 'Background verification', category: 'VERIFICATION' },
  { key: 'police', title: 'Police verification (child safety)', category: 'VERIFICATION', teachingOnly: true },
  { key: 'employee_code', title: 'Employee code assigned', category: 'ACCOUNTS' },
  { key: 'login', title: 'ERP sign-in created', category: 'ACCOUNTS' },
  { key: 'id_card', title: 'ID card and email issued', category: 'ACCOUNTS' },
  { key: 'payroll', title: 'Enrolled in payroll (salary structure)', category: 'PAYROLL' },
  { key: 'pf_esi', title: 'PF (UAN) / ESI registration', category: 'PAYROLL' },
  { key: 'induction', title: 'Induction training completed', category: 'INDUCTION' },
];

export async function createOnboardingTasks(tx: Tx, ctx: RequestContext, staffId: string, staffType: string, done: string[] = []) {
  const existing = new Set((await tx.onboardingTask.findMany({ where: { staffId }, select: { taskKey: true } })).map((t) => t.taskKey));
  const tasks = ONBOARDING_TASKS.filter((t) => !t.teachingOnly || staffType === 'TEACHING');
  for (const [i, t] of tasks.entries()) {
    if (existing.has(t.key)) continue;
    const isDone = done.includes(t.key);
    await tx.onboardingTask.create({
      data: { organizationId: ctx.organizationId, staffId, taskKey: t.key, title: t.title, category: t.category, sortOrder: i + 1, done: isDone, doneAt: isDone ? new Date() : null, doneById: isDone ? ctx.userId : null },
    });
  }
}

export const toMonthStart = (month: string) => new Date(`${month}-01T00:00:00Z`);
export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
