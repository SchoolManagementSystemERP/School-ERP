/**
 * Turns the "greenwood" demo into a small school group for the group office (after `npm run import:frontend`):
 *   npm run seed:group
 * - two regions: Lucknow (Gomti Nagar + Aliganj Junior Wing) and Kanpur (a new school);
 * - the Junior Wing and the Kanpur school get classes, fee plans, teachers and students;
 * - a sign-in for every head-office role (password Demo@1234), the whole Lucknow region office
 *   (regional manager and 18 region roles, `lko.*`) and a cluster head for Kanpur;
 * - activity in the two new schools so the group dashboard has something to compare: fee payments,
 *   30 days of attendance, a published unit test, expenses and admission enquiries.
 * Gomti Nagar keeps its own (richer) demo data. Safe to run again — finished steps are skipped.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma, withTenant, withSystem, type Tx } from '../src/db/prisma.js';

const PASSWORD = 'Demo@1234';
const EXAM = 'Unit Test 1';
const DAY = 86_400_000;

const REGIONS = { lucknow: 'Lucknow', kanpur: 'Kanpur' };

/** The schools besides Gomti Nagar: what they teach and how well they are doing (for a visible spread). */
const SCHOOLS = [
  {
    code: 'GIS-AG', name: 'Greenwood International School Junior Wing, Aliganj', city: 'Lucknow', region: REGIONS.lucknow,
    address: 'Sector C, Aliganj', grades: [1, 2, 3, 4, 5], fee: 36000, teachers: 6,
    profile: { feesPaid: 0.9, present: 0.92, marks: [60, 96] as [number, number], spend: 0.7, enquiries: 4 },
  },
  {
    code: 'GIS-KNP', name: 'Greenwood International School, Kanpur', city: 'Kanpur', region: REGIONS.kanpur,
    address: '117/H-1, Pandu Nagar', grades: [6, 7, 8, 9, 10], fee: 40000, teachers: 7,
    profile: { feesPaid: 0.6, present: 0.77, marks: [35, 80] as [number, number], spend: 1.2, enquiries: 2 },
  },
];
const STUDENTS_PER_SECTION = 8;

const HEAD_OFFICE: { username: string; name: string; role: string; region?: string }[] = [
  { username: 'director', name: 'Dr. Anil Kapoor', role: 'DIRECTOR' },
  { username: 'secretary', name: 'Shri R. K. Malhotra', role: 'TRUST_SECRETARY' },
  { username: 'treasurer', name: 'CA Sunita Arora', role: 'TREASURER' },
  { username: 'trustee', name: 'Smt. Kamla Devi', role: 'TRUSTEE' },
  { username: 'academic.head', name: 'Dr. Shalini Iyer', role: 'ACADEMIC_HEAD' },
  { username: 'finance.head', name: 'Mr. Vivek Jain', role: 'FINANCE_HEAD' },
  { username: 'hr.head', name: 'Ms. Neha Bansal', role: 'HR_HEAD' },
  { username: 'admissions.head', name: 'Ms. Pooja Mehta', role: 'ADMISSIONS_HEAD' },
  { username: 'purchase.head', name: 'Mr. Harish Gupta', role: 'PURCHASE_HEAD' },
  { username: 'it.head', name: 'Mr. Rohit Verma', role: 'IT_HEAD' },
  { username: 'compliance', name: 'Adv. Meera Iyer', role: 'COMPLIANCE_OFFICER' },
  { username: 'auditor', name: 'CA Deepak Rao', role: 'INTERNAL_AUDITOR' },
  { username: 'inspection', name: 'Dr. S. N. Tripathi', role: 'INSPECTION_OFFICER' },
  { username: 'transport.head', name: 'Mr. Balwinder Singh', role: 'TRANSPORT_HEAD' },
  { username: 'marketing', name: 'Ms. Ritika Sen', role: 'MARKETING_HEAD' },
  { username: 'training', name: 'Mrs. Anjali Dubey', role: 'TRAINING_COORDINATOR' },
  { username: 'regional.manager', name: 'Mr. Alok Srivastava', role: 'REGIONAL_MANAGER', region: REGIONS.lucknow },
  { username: 'cluster.head', name: 'Mr. Prakash Mishra', role: 'CLUSTER_HEAD', region: REGIONS.kanpur },
  // the Lucknow region office
  { username: 'lko.asst.director', name: 'Mrs. Shobha Saxena', role: 'ASST_REGIONAL_DIRECTOR', region: REGIONS.lucknow },
  { username: 'lko.academic', name: 'Dr. Ravi Shukla', role: 'REGIONAL_ACADEMIC_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.subject', name: 'Mr. Ashok Tiwari (Mathematics)', role: 'SUBJECT_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.exams', name: 'Ms. Garima Awasthi', role: 'REGIONAL_EXAM_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.inspector', name: 'Dr. Mahesh Pandey', role: 'REGIONAL_INSPECTOR', region: REGIONS.lucknow },
  { username: 'lko.training', name: 'Mrs. Rachna Kapoor', role: 'REGIONAL_TRAINING_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.counselling', name: 'Ms. Nidhi Khanna', role: 'REGIONAL_COUNSELLING_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.accounts', name: 'Mr. Sanjay Agarwal', role: 'REGIONAL_ACCOUNTS_OFFICER', region: REGIONS.lucknow },
  { username: 'lko.auditor', name: 'CA Pallavi Jain', role: 'REGIONAL_AUDITOR', region: REGIONS.lucknow },
  { username: 'lko.hr', name: 'Ms. Swati Nigam', role: 'REGIONAL_HR_OFFICER', region: REGIONS.lucknow },
  { username: 'lko.admissions', name: 'Mr. Kunal Bajpai', role: 'REGIONAL_ADMISSIONS_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.purchase', name: 'Mr. Dinesh Yadav', role: 'REGIONAL_PURCHASE_OFFICER', region: REGIONS.lucknow },
  { username: 'lko.transport', name: 'Mr. Gurpreet Singh', role: 'REGIONAL_TRANSPORT_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.infra', name: 'Er. Vinod Chaurasia', role: 'REGIONAL_INFRASTRUCTURE_OFFICER', region: REGIONS.lucknow },
  { username: 'lko.it', name: 'Mr. Abhishek Rastogi', role: 'REGIONAL_IT_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.sports', name: 'Mr. Ranjit Rawat', role: 'REGIONAL_SPORTS_COORDINATOR', region: REGIONS.lucknow },
  { username: 'lko.pr', name: 'Ms. Tanya Mehrotra', role: 'REGIONAL_PR_OFFICER', region: REGIONS.lucknow },
  { username: 'lko.office', name: 'Mr. Ramesh Kumar', role: 'REGIONAL_OFFICE_STAFF', region: REGIONS.lucknow },
];

const BOYS = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Reyansh', 'Kabir', 'Ishaan', 'Rohan', 'Aryan', 'Dev', 'Yash', 'Pranav'];
const GIRLS = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Ira', 'Myra', 'Kavya', 'Riya', 'Anika', 'Tanvi', 'Meera', 'Shreya'];
const SURNAMES = ['Sharma', 'Verma', 'Singh', 'Gupta', 'Mishra', 'Srivastava', 'Tiwari', 'Pandey', 'Yadav', 'Agarwal', 'Shukla', 'Awasthi'];
const ADULTS = ['Rajesh', 'Sunita', 'Manoj', 'Anita', 'Vikas', 'Rekha', 'Sanjay', 'Kiran', 'Ajay', 'Seema'];
const SUBJECTS = [['Mathematics', 'TGT'], ['English', 'TGT'], ['Hindi', 'TGT'], ['Science', 'TGT'], ['Social Science', 'TGT'], ['Computer', 'PRT'], ['Art', 'PRT']] as const;

// a fixed sequence, so the demo looks the same on every machine
let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

async function main() {
  const org = await withSystem((tx) => tx.organization.findUnique({ where: { subdomain: 'greenwood' }, select: { id: true } }));
  if (!org) throw new Error('Organization "greenwood" not found — run `npm run import:frontend` first.');
  const orgId = org.id;
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // ── regions and schools ──
  await withTenant(orgId, async (tx) => {
    const regionId = async (name: string) =>
      (await tx.region.findFirst({ where: { name } }))?.id ?? (await tx.region.create({ data: { organizationId: orgId, name } })).id;
    const lucknow = await regionId(REGIONS.lucknow);
    await tx.branch.updateMany({ where: { code: 'GIS-GN', regionId: null }, data: { regionId: lucknow } });
    const main = await tx.branch.findFirstOrThrow({ where: { code: 'GIS-GN' } });
    for (const s of SCHOOLS) {
      const rid = await regionId(s.region);
      const existing = await tx.branch.findFirst({ where: { code: s.code } });
      if (existing) await tx.branch.update({ where: { id: existing.id }, data: { regionId: rid, name: s.name, city: s.city, address: s.address } });
      else {
        await tx.branch.create({
          data: { organizationId: orgId, regionId: rid, code: s.code, name: s.name, board: 'CBSE', address: s.address, city: s.city, state: main.state, phone: main.phone, email: main.email },
        });
        console.log(`school: ${s.name}`);
      }
    }
  });

  // ── classes, fees, teachers and students in the new schools ──
  for (const s of SCHOOLS) await withTenant(orgId, (tx) => fillSchool(tx, orgId, s));

  // ── head-office sign-ins ──
  await withTenant(orgId, async (tx) => {
    const regions = await tx.region.findMany({ select: { id: true, name: true } });
    for (const u of HEAD_OFFICE) {
      if (await tx.user.findFirst({ where: { username: u.username } })) continue;
      const role = await tx.role.findFirst({ where: { code: u.role, organizationId: null } });
      if (!role) throw new Error(`Role ${u.role} is missing — run database/migrate.ps1 (migration 011).`);
      const regionId = u.region ? regions.find((r) => r.name === u.region)?.id ?? null : null;
      const user = await tx.user.create({ data: { organizationId: orgId, username: u.username, name: u.name, passwordHash, mustChangePassword: false } });
      await tx.membership.create({ data: { organizationId: orgId, userId: user.id, roleId: role.id, scopeType: regionId ? 'REGION' : 'ORG', regionId, branchId: null } });
      console.log(`sign-in: ${u.username} (${role.name})`);
    }
  });

  // ── activity in the new schools ──
  for (const s of SCHOOLS) await withTenant(orgId, (tx) => addActivity(tx, orgId, s));
}

/** Grades with one section each, a tuition plan per grade (same installments as the main school), teachers, students. */
async function fillSchool(tx: Tx, orgId: string, s: (typeof SCHOOLS)[number]) {
  const branch = await tx.branch.findFirstOrThrow({ where: { code: s.code } });
  if (await tx.student.count({ where: { branchId: branch.id } })) return;
  const year = await tx.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  const yy = String(year.startDate.getUTCFullYear()).slice(-2);
  const main = await tx.branch.findFirstOrThrow({ where: { code: 'GIS-GN' }, select: { id: true } });
  const mainPlan = await tx.feePlan.findFirstOrThrow({ where: { academicYearId: year.id, feeHead: 'TUITION', branchId: main.id }, include: { installments: { orderBy: { installmentNo: 'asc' } } } });

  const teacherIds: string[] = [];
  for (let i = 1; i <= s.teachers; i++) {
    const [subject, designation] = SUBJECTS[(i - 1) % SUBJECTS.length];
    const female = rand() < 0.6;
    teacherIds.push((await tx.staff.create({
      data: {
        organizationId: orgId, branchId: branch.id, employeeCode: `${s.code.split('-')[1]}-T${String(i).padStart(3, '0')}`, name: `${pick(ADULTS)} ${pick(SURNAMES)}`,
        gender: female ? 'FEMALE' : 'MALE', staffType: 'TEACHING', designation, department: subject, employmentType: 'PERMANENT',
        joiningDate: new Date(Date.UTC(2016 + (i % 8), i % 12, 1)), basicSalary: designation === 'TGT' ? 42000 : 36000,
        allowances: JSON.stringify({ hra: 8000, da: 0, ta: 1600, other: 2000 }),
      },
    })).id);
  }

  let seq = 0;
  for (const [k, n] of s.grades.entries()) {
    const grade = await tx.grade.create({ data: { organizationId: orgId, branchId: branch.id, name: `Class ${n}`, sortOrder: n, medium: 'English' } });
    const section = await tx.section.create({ data: { organizationId: orgId, branchId: branch.id, gradeId: grade.id, name: 'A', classTeacherId: teacherIds[k] ?? null } });
    await tx.feePlan.create({
      data: {
        organizationId: orgId, branchId: branch.id, academicYearId: year.id, gradeId: grade.id, feeHead: 'TUITION', annualAmount: s.fee + n * 1000,
        installments: { create: mainPlan.installments.map((i) => ({ organizationId: orgId, installmentNo: i.installmentNo, name: i.name, dueDate: i.dueDate, percent: i.percent })) },
      },
    });
    for (let r = 1; r <= STUDENTS_PER_SECTION; r++) {
      const female = rand() < 0.5;
      const student = await tx.student.create({
        data: {
          organizationId: orgId, branchId: branch.id, admissionNo: `${s.code}/${yy}/${String(++seq).padStart(4, '0')}`,
          firstName: pick(female ? GIRLS : BOYS), lastName: pick(SURNAMES), gender: female ? 'FEMALE' : 'MALE',
          dob: new Date(Date.UTC(year.startDate.getUTCFullYear() - n - 5, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28))),
          admissionDate: new Date(Date.UTC(year.startDate.getUTCFullYear() - (rand() < 0.3 ? 0 : 1 + Math.floor(rand() * 3)), 3, 1)),
        },
      });
      await tx.enrollment.create({ data: { organizationId: orgId, branchId: branch.id, studentId: student.id, academicYearId: year.id, sectionId: section.id, rollNo: String(r).padStart(3, '0') } });
    }
  }
  console.log(`${s.code}: ${s.grades.length} classes, ${s.teachers} teachers, ${seq} students`);
}

/** Fee payments, 30 days of attendance, a published unit test, expenses and open enquiries. */
async function addActivity(tx: Tx, orgId: string, s: (typeof SCHOOLS)[number]) {
  const p = s.profile;
  const b = await tx.branch.findFirstOrThrow({ where: { code: s.code } });
  const year = await tx.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  if (await tx.exam.findFirst({ where: { branchId: b.id, academicYearId: year.id, name: EXAM } })) return;
  const actor = (await tx.user.findFirstOrThrow({ where: { username: 'principal' }, select: { id: true } })).id;
  const enrollments = await tx.enrollment.findMany({ where: { academicYearId: year.id, branchId: b.id }, select: { studentId: true, sectionId: true, section: { select: { gradeId: true, grade: { select: { name: true } } } } } });
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  const plans = await tx.feePlan.findMany({ where: { branchId: b.id, academicYearId: year.id, feeHead: 'TUITION' }, include: { installments: true } });
  let receipt = 0;
  let payments = 0;
  for (const e of enrollments) {
    const plan = plans.find((x) => x.gradeId === e.section.gradeId)!;
    for (const inst of plan.installments.filter((i) => i.dueDate <= today)) {
      if (rand() > p.feesPaid) continue;
      await tx.feePayment.create({
        data: {
          organizationId: orgId, branchId: b.id, studentId: e.studentId, installmentId: inst.id, amount: Math.round((Number(plan.annualAmount) * Number(inst.percent)) / 100),
          lateFee: 0, method: rand() < 0.6 ? 'UPI' : 'CASH', status: 'SUCCESS', receiptNo: `${s.code}/DEMO/${String(++receipt).padStart(5, '0')}`,
          idempotencyKey: randomUUID(), receivedById: actor, paidAt: new Date(Math.min(today.getTime(), inst.dueDate.getTime() + Math.floor(rand() * 20 - 10) * DAY)),
        },
      });
      payments++;
    }
  }

  const bySection = new Map<string, string[]>();
  for (const e of enrollments) bySection.set(e.sectionId, [...(bySection.get(e.sectionId) ?? []), e.studentId]);
  for (let d = 30; d >= 1; d--) {
    const date = new Date(today.getTime() - d * DAY);
    if (date.getUTCDay() === 0) continue;
    for (const [sectionId, studentIds] of bySection) {
      const session = await tx.attendanceSession.create({ data: { organizationId: orgId, branchId: b.id, sectionId, date, periodNo: null, subjectId: null, takenById: actor } });
      await tx.attendanceEntry.createMany({
        data: studentIds.map((studentId) => {
          const r = rand();
          return { organizationId: orgId, sessionId: session.id, studentId, status: r < p.present ? 'PRESENT' : r < p.present + 0.04 ? 'LEAVE' : 'ABSENT' };
        }),
      });
    }
  }

  const subjects = await tx.subject.findMany({ take: 3, orderBy: { code: 'asc' }, select: { id: true } });
  const grades = [...new Set(enrollments.map((e) => e.section.grade.name))];
  const exam = await tx.exam.create({ data: { organizationId: orgId, branchId: b.id, academicYearId: year.id, name: EXAM, gradeNames: grades.join(','), resultsPublished: true, publishedAt: today } });
  for (const [k, subj] of subjects.entries()) {
    const paper = await tx.examPaper.create({
      data: { organizationId: orgId, examId: exam.id, subjectId: subj.id, date: new Date(today.getTime() - (20 - k) * DAY), startTime: '09:00', endTime: '10:30', maxMarks: 50, passMarks: 17 },
    });
    await tx.mark.createMany({
      data: enrollments.map((e) => ({ organizationId: orgId, branchId: b.id, examPaperId: paper.id, studentId: e.studentId, marks: Math.round(((p.marks[0] + rand() * (p.marks[1] - p.marks[0])) / 100) * 50), isAbsent: false, enteredById: actor })),
    });
  }

  const spend = [['Electricity', 'Electricity bill', 42000], ['Maintenance', 'Classroom repairs', 30000], ['Stationery', 'Exam stationery', 9000], ['Events', 'Annual sports day', 50000]] as const;
  for (const [k, [category, description, amount]] of spend.entries()) {
    await tx.expense.create({ data: { organizationId: orgId, branchId: b.id, date: new Date(today.getTime() - (k * 25 + 5) * DAY), category, description, amount: Math.round(amount * p.spend), method: 'BANK_TRANSFER', createdById: actor } });
  }
  for (let k = 0; k < p.enquiries; k++) {
    const child = `${pick(BOYS)} ${pick(SURNAMES)}`;
    await tx.enquiry.create({
      data: { organizationId: orgId, branchId: b.id, studentName: child, parentName: `${pick(ADULTS)} ${child.split(' ')[1]}`, phone: `94150${String(10000 + k * 37 + receipt).slice(-5)}`, gradeName: grades[k % grades.length], source: k % 2 ? 'Website' : 'Walk-in', status: k % 3 ? 'NEW' : 'CONTACTED' },
    });
  }
  console.log(`${s.code}: ${payments} fee payments, 30 days of attendance, "${EXAM}", ${spend.length} expenses, ${p.enquiries} enquiries`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
