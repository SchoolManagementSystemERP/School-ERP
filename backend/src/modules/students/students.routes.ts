import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { scopeBranches, targetBranch, type RequestContext } from '../../auth/access.js';
import { withTenant, type Tx } from '../../db/prisma.js';
import { currentYear } from '../../lib/academic.js';
import { audit } from '../../lib/audit.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { dateOnly, idParam, pageResult, paging, parseJson, toDateString } from '../../lib/http.js';
import { ctxOf } from '../../middleware/authenticate.js';
import { mergeEncrypted } from '../../lib/crypto.js';
import { PASSWORD_ROUNDS } from '../auth/auth.routes.js';

export const studentsRouter = Router();

// ── Shapes ───────────────────────────────────────────────────────────────────

const RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN'] as const;
const STATUSES = ['ACTIVE', 'TRANSFERRED', 'PASSED_OUT', 'LEFT'] as const;

const guardianInput = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().trim().regex(/^\+?[0-9 -]{10,15}$/, 'Phone number'),
  relation: z.enum(RELATIONS),
  email: z.string().trim().email().max(200).nullable().optional(),
  occupation: z.string().trim().max(100).nullable().optional(),
  annualIncome: z.string().trim().max(30).nullable().optional(),
  isPrimary: z.boolean().optional(),
});

const personal = {
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  dob: dateOnly.nullable().optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
  category: z.enum(['GENERAL', 'OBC', 'SC', 'ST', 'EWS']).nullable().optional(),
  religion: z.string().trim().max(30).nullable().optional(),
  /** Stored encrypted; only the last four digits are kept readable. */
  aadhaar: z.string().regex(/^\d{12}$/, '12 digits').nullable().optional(),
  admissionDate: dateOnly.nullable().optional(),
  address: z.record(z.unknown()).nullable().optional(),
  health: z.record(z.unknown()).nullable().optional(),
  previousSchool: z.record(z.unknown()).nullable().optional(),
  /** Everything else the school records (activities, documents checklist, transport wishes…). */
  profile: z.record(z.unknown()).nullable().optional(),
};

const createSchema = z.object({
  ...personal,
  branchId: z.string().uuid().optional(),
  admissionNo: z.string().trim().regex(/^[A-Za-z0-9/-]{1,30}$/).optional(),
  sectionId: z.string().uuid(),
  rollNo: z.string().trim().regex(/^[0-9A-Za-z]{1,10}$/).optional(),
  guardians: z.array(guardianInput).min(1).max(4),
  /** Also create sign-ins: the student (username = admission no.) and the primary guardian (username = phone). */
  createLogins: z.boolean().default(false),
});

const updateSchema = z
  .object({
    ...personal,
    status: z.enum(STATUSES),
    /** Move to another section of the same branch for the current year. */
    sectionId: z.string().uuid(),
    rollNo: z.string().trim().regex(/^[0-9A-Za-z]{1,10}$/),
  })
  .partial();

/**
 * Turns validated personal fields into column values (JSON → text). Aadhaar goes into the encrypted
 * `sensitive` JSON with only its last 4 digits readable; pass the row's current `sensitive` when updating.
 */
function personalColumns(body: Partial<z.infer<typeof createSchema>>, currentSensitive?: string | null) {
  const { aadhaar, address, health, previousSchool, profile, ...rest } = body;
  const json = (v: unknown) => (v === undefined ? undefined : v === null ? null : JSON.stringify(v));
  return {
    firstName: rest.firstName,
    middleName: rest.middleName,
    lastName: rest.lastName,
    gender: rest.gender,
    dob: rest.dob,
    bloodGroup: rest.bloodGroup,
    category: rest.category,
    religion: rest.religion,
    admissionDate: rest.admissionDate,
    aadhaarLast4: aadhaar === undefined ? undefined : aadhaar === null ? null : aadhaar.slice(-4),
    sensitive: aadhaar === undefined ? undefined : mergeEncrypted(currentSensitive, { aadhaar }),
    address: json(address),
    health: json(health),
    previousSchool: json(previousSchool),
    profile: json(profile),
  };
}

const fullName = (s: { firstName: string; middleName?: string | null; lastName?: string | null }) =>
  [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');

function enrollmentSelect(academicYearId: string) {
  return {
    where: { academicYearId },
    select: {
      id: true, rollNo: true, status: true,
      section: { select: { id: true, name: true, grade: { select: { id: true, name: true, sortOrder: true } } } },
    },
    take: 1,
  } as const;
}

const guardianSelect = {
  select: {
    relation: true, isPrimary: true,
    guardian: { select: { id: true, name: true, phone: true, email: true, occupation: true, annualIncome: true, userId: true } },
  },
  orderBy: { isPrimary: 'desc' },
} as const;

type EnrollmentRow = { id: string; rollNo: string; status: string; section: { id: string; name: string; grade: { id: string; name: string; sortOrder: number } } };
const classOut = (e: EnrollmentRow | undefined) =>
  e ? { enrollmentId: e.id, gradeId: e.section.grade.id, grade: e.section.grade.name, sectionId: e.section.id, section: e.section.name, rollNo: e.rollNo, status: e.status } : null;

type GuardianRow = { relation: string; isPrimary: boolean; guardian: { id: string; name: string; phone: string; email: string | null; occupation: string | null; annualIncome: string | null; userId: string | null } };
const guardianOut = (g: GuardianRow) => ({
  id: g.guardian.id, name: g.guardian.name, phone: g.guardian.phone, email: g.guardian.email, occupation: g.guardian.occupation,
  annualIncome: g.guardian.annualIncome, relation: g.relation, isPrimary: g.isPrimary, hasLogin: !!g.guardian.userId,
});

/** Attendance % this academic year per student (present + late over all marked periods); absent when nothing is marked. */
async function attendanceRates(tx: Tx, studentIds: string[], since: Date) {
  const rates = new Map<string, number>();
  if (!studentIds.length) return rates;
  const rows = await tx.attendanceEntry.groupBy({
    by: ['studentId', 'status'],
    where: { studentId: { in: studentIds }, session: { date: { gte: since } } },
    _count: { _all: true },
  });
  const tally = new Map<string, { present: number; total: number }>();
  for (const r of rows) {
    const t = tally.get(r.studentId) ?? { present: 0, total: 0 };
    t.total += r._count._all;
    if (r.status === 'PRESENT' || r.status === 'LATE') t.present += r._count._all;
    tally.set(r.studentId, t);
  }
  for (const [id, t] of tally) rates.set(id, Math.round((t.present / t.total) * 1000) / 10);
  return rates;
}

async function loadStudent(tx: Tx, id: string) {
  const year = await currentYear(tx);
  const s = await tx.student.findUnique({
    where: { id },
    include: {
      enrollments: enrollmentSelect(year.id),
      guardians: guardianSelect,
    },
  });
  if (!s) return null;
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: s.branchId }, select: { id: true, code: true, name: true } });
  return {
    id: s.id,
    admissionNo: s.admissionNo,
    name: fullName(s),
    firstName: s.firstName, middleName: s.middleName, lastName: s.lastName,
    gender: s.gender, dob: toDateString(s.dob), bloodGroup: s.bloodGroup, category: s.category, religion: s.religion,
    aadhaarLast4: s.aadhaarLast4, admissionDate: toDateString(s.admissionDate), status: s.status,
    address: parseJson(s.address), health: parseJson(s.health), previousSchool: parseJson(s.previousSchool), profile: parseJson(s.profile),
    hasLogin: !!s.userId,
    attendancePercent: (await attendanceRates(tx, [s.id], year.startDate)).get(s.id) ?? null,
    branch,
    academicYear: year.name,
    class: classOut(s.enrollments[0]),
    guardians: s.guardians.map(guardianOut),
  };
}

/** Read access: students.read in the student's branch, or the student / their guardian. */
async function assertCanRead(tx: Tx, ctx: RequestContext, studentId: string, branchId: string) {
  if (ctx.access.can('students.read', branchId)) return;
  const linked = await tx.student.count({
    where: { id: studentId, OR: [{ userId: ctx.userId }, { guardians: { some: { guardian: { userId: ctx.userId } } } }] },
  });
  if (!linked) throw notFound('Student'); // do not reveal that the student exists
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** GET /students?search=&gradeId=&sectionId=&status=&sort=&page=&pageSize= */
studentsRouter.get('/students', async (req, res) => {
  const ctx = ctxOf(req);
  const q = paging
    .extend({
      search: z.string().trim().max(80).optional(),
      gradeId: z.string().uuid().optional(),
      sectionId: z.string().uuid().optional(),
      status: z.enum([...STATUSES, 'ALL']).default('ACTIVE'),
      sort: z.enum(['name', 'admissionNo']).default('name'),
    })
    .parse(req.query);
  const branchIds = scopeBranches(ctx, 'students.read');

  const result = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const where: Prisma.StudentWhereInput = {
      branchId: { in: branchIds },
      ...(q.status === 'ALL' ? {} : { status: q.status }),
      ...(q.sectionId || q.gradeId
        ? { enrollments: { some: { academicYearId: year.id, ...(q.sectionId ? { sectionId: q.sectionId } : { section: { gradeId: q.gradeId } }) } } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search } },
              { lastName: { contains: q.search } },
              { admissionNo: { contains: q.search } },
              { guardians: { some: { guardian: { phone: { contains: q.search } } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      tx.student.findMany({
        where,
        select: {
          id: true, admissionNo: true, firstName: true, middleName: true, lastName: true, gender: true, status: true, branchId: true,
          enrollments: enrollmentSelect(year.id),
          guardians: { ...guardianSelect, take: 1 },
        },
        orderBy: q.sort === 'admissionNo' ? { admissionNo: 'asc' } : [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      tx.student.count({ where }),
    ]);
    return { rows, total };
  });

  const items = result.rows.map((s) => ({
    id: s.id,
    admissionNo: s.admissionNo,
    name: fullName(s),
    gender: s.gender,
    status: s.status,
    branchId: s.branchId,
    class: classOut(s.enrollments[0]),
    primaryGuardian: s.guardians[0] ? (({ name, phone, relation }) => ({ name, phone, relation }))(guardianOut(s.guardians[0])) : null,
  }));
  res.json(pageResult(items, result.total, q.page, q.pageSize));
});

/**
 * GET /students/full?status= — every student in the caller's branches with all details, for screens
 * that work on the whole roster. Same fields as GET /students/:id.
 */
studentsRouter.get('/students/full', async (req, res) => {
  const ctx = ctxOf(req);
  const q = z.object({ status: z.enum([...STATUSES, 'ALL']).default('ACTIVE') }).parse(req.query);
  const branchIds = scopeBranches(ctx, 'students.read');
  const out = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const rows = await tx.student.findMany({
      where: { branchId: { in: branchIds }, ...(q.status === 'ALL' ? {} : { status: q.status }) },
      include: { enrollments: enrollmentSelect(year.id), guardians: guardianSelect },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 5000,
    });
    const rates = await attendanceRates(tx, rows.map((r) => r.id), year.startDate);
    return rows.map((s) => ({
      id: s.id, admissionNo: s.admissionNo, name: fullName(s), firstName: s.firstName, middleName: s.middleName, lastName: s.lastName,
      gender: s.gender, dob: toDateString(s.dob), bloodGroup: s.bloodGroup, category: s.category, religion: s.religion,
      aadhaarLast4: s.aadhaarLast4, admissionDate: toDateString(s.admissionDate), status: s.status, branchId: s.branchId,
      address: parseJson(s.address), health: parseJson(s.health), previousSchool: parseJson(s.previousSchool), profile: parseJson(s.profile),
      hasLogin: !!s.userId, attendancePercent: rates.get(s.id) ?? null, academicYear: year.name, class: classOut(s.enrollments[0]), guardians: s.guardians.map(guardianOut),
    }));
  });
  res.json(out);
});

/** GET /students/:id */
studentsRouter.get('/students/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const student = await withTenant(ctx.organizationId, async (tx) => {
    const s = await tx.student.findUnique({ where: { id }, select: { branchId: true } });
    if (!s) throw notFound('Student');
    await assertCanRead(tx, ctx, id, s.branchId);
    return loadStudent(tx, id);
  });
  res.json(student);
});

/** Section must be in the branch and have room this year. Returns the roll number to use. */
async function placeInSection(tx: Tx, branchId: string, academicYearId: string, sectionId: string, rollNo: string | undefined, excludeEnrollmentId?: string) {
  const section = await tx.section.findUnique({ where: { id: sectionId }, select: { branchId: true, capacity: true } });
  if (!section || section.branchId !== branchId.toLowerCase()) throw badRequest('Section does not belong to this branch.');

  const taken = await tx.enrollment.findMany({
    where: { sectionId, academicYearId, status: 'ACTIVE', ...(excludeEnrollmentId ? { NOT: { id: excludeEnrollmentId } } : {}) },
    select: { rollNo: true },
  });
  if (taken.length >= section.capacity) throw conflict(`This section is full (capacity ${section.capacity}).`);

  if (rollNo) {
    if (taken.some((t) => t.rollNo === rollNo)) throw conflict(`Roll number ${rollNo} is already taken in this section.`);
    return rollNo;
  }
  const next = Math.max(0, ...taken.map((t) => Number.parseInt(t.rollNo, 10)).filter(Number.isFinite)) + 1;
  return String(next).padStart(3, '0');
}

/** Admission number like DAV-RNC/26/0042 (branch / year of admission / sequence). */
async function nextAdmissionNo(tx: Tx, branchId: string, yearStart: Date) {
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId }, select: { code: true } });
  const prefix = `${branch.code}/${String(yearStart.getUTCFullYear()).slice(-2)}/`;
  const last = await tx.student.findFirst({ where: { admissionNo: { startsWith: prefix } }, orderBy: { admissionNo: 'desc' }, select: { admissionNo: true } });
  const seq = last ? Number.parseInt(last.admissionNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Reuses a guardian already on file (same phone and name, e.g. for a sibling), else creates one. */
async function upsertGuardian(tx: Tx, organizationId: string, g: z.infer<typeof guardianInput>) {
  const existing = await tx.guardian.findFirst({ where: { phone: g.phone, name: g.name } });
  const data = { email: g.email ?? null, occupation: g.occupation ?? null, annualIncome: g.annualIncome ?? null };
  if (existing) return tx.guardian.update({ where: { id: existing.id }, data });
  return tx.guardian.create({ data: { organizationId, name: g.name, phone: g.phone, ...data } });
}

async function setGuardians(tx: Tx, organizationId: string, studentId: string, list: z.infer<typeof guardianInput>[]) {
  const relations = list.map((g) => g.relation).filter((r) => r !== 'GUARDIAN');
  if (new Set(relations).size !== relations.length) throw badRequest('Only one father and one mother can be added.');
  const primaryIndex = Math.max(0, list.findIndex((g) => g.isPrimary));
  await tx.studentGuardian.deleteMany({ where: { studentId } });
  const saved: Awaited<ReturnType<typeof upsertGuardian>>[] = [];
  for (const [i, g] of list.entries()) {
    const guardian = await upsertGuardian(tx, organizationId, g);
    if (saved.some((s) => s.id === guardian.id)) throw badRequest('The same guardian is listed twice.');
    await tx.studentGuardian.create({ data: { organizationId, studentId, guardianId: guardian.id, relation: g.relation, isPrimary: i === primaryIndex } });
    saved.push(guardian);
  }
  return saved[primaryIndex];
}

const temporaryPassword = () => `Erp${randomBytes(5).toString('hex')}7`;

/** Creates a sign-in with one SELF-level role at the branch. */
async function createSelfLogin(tx: Tx, organizationId: string, branchId: string, roleCode: 'STUDENT' | 'PARENT', username: string, name: string, phone: string | null) {
  if (await tx.user.findFirst({ where: { username } })) throw conflict(`Username ${username} is already in use.`);
  const role = await tx.role.findFirstOrThrow({ where: { code: roleCode, organizationId: null } });
  const password = temporaryPassword();
  const user = await tx.user.create({
    data: { organizationId, username, name, phone, passwordHash: await bcrypt.hash(password, PASSWORD_ROUNDS), mustChangePassword: true },
  });
  await tx.membership.create({ data: { organizationId, userId: user.id, roleId: role.id, scopeType: 'BRANCH', branchId } });
  return { userId: user.id, username, temporaryPassword: password };
}

/** POST /students — admission: student, guardians and this year's enrollment in one go. Needs students.write. */
studentsRouter.post('/students', async (req, res) => {
  const ctx = ctxOf(req);
  const body = createSchema.parse(req.body);
  const branchId = targetBranch(ctx, 'students.write', body.branchId);

  const result = await withTenant(ctx.organizationId, async (tx) => {
    const year = await currentYear(tx);
    const rollNo = await placeInSection(tx, branchId, year.id, body.sectionId, body.rollNo);
    const admissionNo = body.admissionNo ?? (await nextAdmissionNo(tx, branchId, year.startDate));
    if (await tx.student.findFirst({ where: { admissionNo } })) throw conflict(`Admission number ${admissionNo} already exists.`);

    const student = await tx.student.create({
      data: {
        ...personalColumns(body),
        firstName: body.firstName,
        organizationId: ctx.organizationId,
        branchId,
        admissionNo,
        admissionDate: body.admissionDate ?? new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    await tx.enrollment.create({
      data: { organizationId: ctx.organizationId, branchId, studentId: student.id, academicYearId: year.id, sectionId: body.sectionId, rollNo },
    });
    const primary = await setGuardians(tx, ctx.organizationId, student.id, body.guardians);

    const logins: { student?: object; parent?: object } = {};
    if (body.createLogins) {
      const s = await createSelfLogin(tx, ctx.organizationId, branchId, 'STUDENT', admissionNo, fullName(body), null);
      await tx.student.update({ where: { id: student.id }, data: { userId: s.userId } });
      logins.student = { username: s.username, temporaryPassword: s.temporaryPassword };
      if (!primary.userId) {
        const p = await createSelfLogin(tx, ctx.organizationId, branchId, 'PARENT', primary.phone.replace(/\D/g, ''), primary.name, primary.phone);
        await tx.guardian.update({ where: { id: primary.id }, data: { userId: p.userId } });
        logins.parent = { username: p.username, temporaryPassword: p.temporaryPassword };
      }
    }

    await audit(tx, ctx, { action: 'CREATE', entity: 'Student', entityId: student.id, branchId, after: { ...body, aadhaar: undefined, admissionNo, rollNo } });
    return { student: await loadStudent(tx, student.id), logins };
  });

  res.status(201).json({ ...result.student, logins: Object.keys(result.logins).length ? result.logins : undefined });
});

/** PATCH /students/:id — personal details, status, or move to another section this year. Needs students.write. */
studentsRouter.patch('/students/:id', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const body = updateSchema.parse(req.body);
  if (Object.keys(body).length === 0) throw badRequest('Nothing to update.');

  const student = await withTenant(ctx.organizationId, async (tx) => {
    const before = await tx.student.findUnique({ where: { id } });
    if (!before) throw notFound('Student');
    if (!ctx.access.can('students.write', before.branchId)) {
      if (ctx.access.can('students.read', before.branchId)) throw forbidden();
      throw notFound('Student');
    }

    const { status, sectionId, rollNo, ...rest } = body;
    await tx.student.update({ where: { id }, data: { ...personalColumns(rest, before.sensitive), status } });

    if (sectionId || rollNo) {
      const year = await currentYear(tx);
      const enrollment = await tx.enrollment.findFirst({ where: { studentId: id, academicYearId: year.id } });
      if (!enrollment) throw new AppError(409, 'NOT_ENROLLED', 'The student is not enrolled in the current year.');
      const targetSection = (sectionId ?? enrollment.sectionId).toLowerCase();
      const sameSection = targetSection === enrollment.sectionId.toLowerCase();
      const newRoll = await placeInSection(tx, before.branchId, year.id, targetSection, rollNo ?? (sameSection ? enrollment.rollNo : undefined), enrollment.id);
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { sectionId: targetSection, rollNo: newRoll } });
    }
    if (status && status !== before.status) {
      // The current-year enrollment follows the student: it stops counting towards the section when they leave.
      const year = await currentYear(tx);
      await tx.enrollment.updateMany({ where: { studentId: id, academicYearId: year.id }, data: { status } });
    }

    await audit(tx, ctx, {
      action: 'UPDATE', entity: 'Student', entityId: id, branchId: before.branchId,
      before: { ...before, sensitive: undefined }, after: { ...body, aadhaar: body.aadhaar ? 'changed' : undefined },
    });
    return loadStudent(tx, id);
  });
  res.json(student);
});

/** PUT /students/:id/guardians — replace the guardian list. Needs students.write. */
studentsRouter.put('/students/:id/guardians', async (req, res) => {
  const ctx = ctxOf(req);
  const id = idParam(req);
  const { guardians } = z.object({ guardians: z.array(guardianInput).min(1).max(4) }).parse(req.body);
  const student = await withTenant(ctx.organizationId, async (tx) => {
    const s = await tx.student.findUnique({ where: { id }, select: { branchId: true } });
    if (!s) throw notFound('Student');
    if (!ctx.access.can('students.write', s.branchId)) throw forbidden();
    await setGuardians(tx, ctx.organizationId, id, guardians);
    await audit(tx, ctx, { action: 'UPDATE', entity: 'StudentGuardian', entityId: id, branchId: s.branchId, after: guardians });
    return loadStudent(tx, id);
  });
  res.json(student);
});
