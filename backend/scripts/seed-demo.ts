/**
 * Demo users, staff and students for development. Run after database/seed.sql:
 *   npm run seed:demo
 * Adds to the DAV organization (3 branches) and creates a second, small organization
 * (Greenfield Academy) so tenant isolation can be tried out. Every demo account uses the
 * password printed at the end. Running it again does nothing.
 */
import bcrypt from 'bcryptjs';
import { prisma, withSystem, type Tx } from '../src/db/prisma.js';

const DEMO_PASSWORD = 'Demo@1234';
/** CBSE 9-point grading, the default scale for every organization. */
const CBSE_BANDS = [
  { min: 91, max: 100, grade: 'A1', point: 10 }, { min: 81, max: 90, grade: 'A2', point: 9 }, { min: 71, max: 80, grade: 'B1', point: 8 },
  { min: 61, max: 70, grade: 'B2', point: 7 }, { min: 51, max: 60, grade: 'C1', point: 6 }, { min: 41, max: 50, grade: 'C2', point: 5 },
  { min: 33, max: 40, grade: 'D', point: 4 }, { min: 0, max: 32, grade: 'E', point: 0, remark: 'Needs improvement' },
];

// Deterministic pseudo-random numbers so every run produces the same people.
let seed = 20260412;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

const BOYS = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Reyansh', 'Krishna', 'Ishaan', 'Kabir', 'Rohan', 'Aryan', 'Dev', 'Kunal', 'Yash', 'Rahul', 'Siddharth', 'Harsh', 'Nikhil', 'Pranav'];
const GIRLS = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Ira', 'Myra', 'Kavya', 'Riya', 'Anika', 'Sneha', 'Pooja', 'Tanvi', 'Meera', 'Nisha', 'Priya', 'Shreya', 'Aditi', 'Khushi'];
const SURNAMES = ['Sharma', 'Verma', 'Singh', 'Kumar', 'Gupta', 'Mishra', 'Sinha', 'Das', 'Mahato', 'Oraon', 'Banerjee', 'Ghosh', 'Agarwal', 'Jha', 'Pandey', 'Yadav', 'Chatterjee', 'Kapoor'];
const MEN = ['Rajesh', 'Sunil', 'Manoj', 'Anil', 'Vikas', 'Sanjay', 'Ramesh', 'Ajay', 'Pankaj', 'Deepak'];
const WOMEN = ['Sunita', 'Anita', 'Rekha', 'Kiran', 'Pooja', 'Neha', 'Seema', 'Ritu', 'Priya', 'Manju'];
const TEACHER_SUBJECTS = [['Mathematics', 'PGT'], ['Physics', 'PGT'], ['English', 'TGT'], ['Hindi', 'TGT'], ['Chemistry', 'PGT'], ['Social Science', 'TGT']] as const;

let phoneSeq = 0;
const phone = () => `98${String(31000000 + ++phoneSeq * 7919).padStart(8, '0')}`;

let passwordHash = '';

async function roleId(tx: Tx, code: string) {
  return (await tx.role.findFirstOrThrow({ where: { code, organizationId: null }, select: { id: true } })).id;
}

async function addUser(
  tx: Tx,
  orgId: string,
  u: { username: string; name: string; phone?: string | null; role: string; scope: 'ORG' | 'REGION' | 'BRANCH'; regionId?: string; branchId?: string },
) {
  const user = await tx.user.create({
    data: { organizationId: orgId, username: u.username, name: u.name, phone: u.phone ?? null, passwordHash, mustChangePassword: false },
  });
  await tx.membership.create({
    data: { organizationId: orgId, userId: user.id, roleId: await roleId(tx, u.role), scopeType: u.scope, regionId: u.regionId ?? null, branchId: u.branchId ?? null },
  });
  return user;
}

type BranchRow = { id: string; code: string; name: string };
const short = (code: string) => code.split('-').pop()!.toLowerCase(); // DAV-RNC → rnc

/** Staff, a few staff logins, students with parents and enrollments for one branch. */
async function seedBranch(orgId: string, branch: BranchRow, opts: { studentsPerSection: number; teachers: number; logins: number }) {
  const s = short(branch.code);
  const created = { users: [] as string[], students: 0 };

  await withSystem(async (tx) => {
    const year = await tx.academicYear.findFirstOrThrow({ where: { organizationId: orgId, isCurrent: true } });
    const yy = String(year.startDate.getUTCFullYear()).slice(-2);

    for (const [role, prefix, title] of [
      ['PRINCIPAL', 'principal', 'Principal'],
      ['VICE_PRINCIPAL', 'vp', 'Vice Principal'],
      ['ACCOUNTANT', 'accountant', 'Accountant'],
      ['RECEPTIONIST', 'reception', 'Front Office'],
      ['BRANCH_ADMIN', 'branchadmin', 'Branch Admin'],
    ] as const) {
      const name = `${pick([...MEN, ...WOMEN])} ${pick(SURNAMES)}`;
      await addUser(tx, orgId, { username: `${prefix}.${s}`, name: `${name} (${title})`, role, scope: 'BRANCH', branchId: branch.id });
      created.users.push(`${prefix}.${s}`);
    }

    // Teachers: Staff record + login (username = employee code)
    const teacherIds: string[] = [];
    for (let i = 1; i <= opts.teachers; i++) {
      const [subject, designation] = TEACHER_SUBJECTS[(i - 1) % TEACHER_SUBJECTS.length];
      const female = rand() < 0.5;
      const name = `${pick(female ? WOMEN : MEN)} ${pick(SURNAMES)}`;
      const code = `${s.toUpperCase()}-T${String(i).padStart(3, '0')}`;
      const user = await addUser(tx, orgId, { username: code, name, role: 'TEACHER', scope: 'BRANCH', branchId: branch.id });
      const staff = await tx.staff.create({
        data: {
          organizationId: orgId, branchId: branch.id, userId: user.id, employeeCode: code, name, gender: female ? 'FEMALE' : 'MALE',
          staffType: 'TEACHING', designation, department: subject, employmentType: 'PERMANENT',
          joiningDate: new Date(Date.UTC(2015 + (i % 9), i % 12, 1)), basicSalary: designation === 'PGT' ? 52000 : 44000,
        },
      });
      teacherIds.push(staff.id);
      created.users.push(code);
    }

    const sections = await tx.section.findMany({
      where: { branchId: branch.id },
      include: { grade: { select: { sortOrder: true } } },
      orderBy: [{ grade: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
    let seq = 0;
    let loginsLeft = opts.logins;
    for (const [i, section] of sections.entries()) {
      if (teacherIds[i]) await tx.section.update({ where: { id: section.id }, data: { classTeacherId: teacherIds[i] } });
      for (let r = 1; r <= opts.studentsPerSection; r++) {
        const female = rand() < 0.5;
        const surname = pick(SURNAMES);
        const firstName = pick(female ? GIRLS : BOYS);
        const admissionNo = `${branch.code}/${yy}/${String(++seq).padStart(4, '0')}`;
        const birthYear = year.startDate.getUTCFullYear() - section.grade.sortOrder - 5;

        const student = await tx.student.create({
          data: {
            organizationId: orgId, branchId: branch.id, admissionNo, firstName, lastName: surname, gender: female ? 'FEMALE' : 'MALE',
            dob: new Date(Date.UTC(birthYear, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28))),
            bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-', 'B-']), category: pick(['GENERAL', 'GENERAL', 'OBC', 'SC', 'ST', 'EWS']),
            admissionDate: new Date(Date.UTC(year.startDate.getUTCFullYear() - Math.floor(rand() * 4), 3, 1)),
            address: JSON.stringify({ present: `${10 + Math.floor(rand() * 200)}, ${pick(['Main Road', 'Station Road', 'Lake View', 'Civil Lines'])}` }),
          },
        });
        await tx.enrollment.create({
          data: { organizationId: orgId, branchId: branch.id, studentId: student.id, academicYearId: year.id, sectionId: section.id, rollNo: String(r).padStart(3, '0') },
        });
        const father = await tx.guardian.create({ data: { organizationId: orgId, name: `${pick(MEN)} ${surname}`, phone: phone(), occupation: pick(['Service', 'Business', 'Engineer', 'Teacher', 'Doctor']) } });
        const mother = await tx.guardian.create({ data: { organizationId: orgId, name: `${pick(WOMEN)} ${surname}`, phone: phone(), occupation: pick(['Homemaker', 'Teacher', 'Service', 'Doctor']) } });
        await tx.studentGuardian.create({ data: { organizationId: orgId, studentId: student.id, guardianId: father.id, relation: 'FATHER', isPrimary: true } });
        await tx.studentGuardian.create({ data: { organizationId: orgId, studentId: student.id, guardianId: mother.id, relation: 'MOTHER', isPrimary: false } });

        if (loginsLeft > 0) {
          loginsLeft--;
          const su = await addUser(tx, orgId, { username: admissionNo, name: `${firstName} ${surname}`, role: 'STUDENT', scope: 'BRANCH', branchId: branch.id });
          await tx.student.update({ where: { id: student.id }, data: { userId: su.id } });
          const pu = await addUser(tx, orgId, { username: father.phone, name: father.name, phone: father.phone, role: 'PARENT', scope: 'BRANCH', branchId: branch.id });
          await tx.guardian.update({ where: { id: father.id }, data: { userId: pu.id } });
          created.users.push(`${admissionNo} (student)`, `${father.phone} (parent of ${firstName})`);
        }
        created.students++;
      }
    }
  });
  return created;
}

async function seedDav() {
  const org = await withSystem((tx) =>
    tx.organization.findUnique({ where: { subdomain: 'dav' }, include: { branches: { orderBy: { code: 'asc' } }, regions: true } }),
  );
  if (!org) throw new Error('Organization "dav" not found — run database/seed.sql first.');
  const exists = (username: string) => withSystem((tx) => tx.user.count({ where: { organizationId: org.id, username } }));

  const east = org.regions.find((r) => r.name.startsWith('East'))!;
  if (!(await exists('admin'))) await withSystem(async (tx) => {
    await addUser(tx, org.id, { username: 'chairman', name: 'R. K. Mehta (Chairman)', role: 'GROUP_OWNER', scope: 'ORG' });
    await addUser(tx, org.id, { username: 'admin', name: 'Group Administrator', role: 'GROUP_ADMIN', scope: 'ORG' });
    await addUser(tx, org.id, { username: 'academic.head', name: 'Dr. S. Iyer (Academic Head)', role: 'ACADEMIC_HEAD', scope: 'ORG' });
    await addUser(tx, org.id, { username: 'regional.east', name: 'A. Prasad (Regional Manager, East)', role: 'REGIONAL_MANAGER', scope: 'REGION', regionId: east.id });
  });

  const summary: Record<string, Awaited<ReturnType<typeof seedBranch>>> = {};
  for (const b of org.branches) {
    if (await exists(`principal.${short(b.code)}`)) continue; // each branch is seeded in one transaction
    summary[b.code] = await seedBranch(org.id, b, { studentsPerSection: 3, teachers: 6, logins: 2 });
  }
  return Object.keys(summary).length ? summary : null;
}

async function seedGreenfield() {
  if (await withSystem((tx) => tx.organization.findUnique({ where: { subdomain: 'greenfield' } }))) {
    console.log('Greenfield already exists — skipping.');
    return null;
  }
  const { orgId, branch } = await withSystem(async (tx) => {
    const plan = await tx.plan.findFirstOrThrow({ where: { code: 'basic' } });
    const org = await tx.organization.create({
      data: { name: 'Greenfield Academy', subdomain: 'greenfield', contactEmail: 'office@greenfield.example.in', contactPhone: '+91 33 0000 0000', planId: plan.id, status: 'ACTIVE' },
    });
    const branch = await tx.branch.create({
      data: { organizationId: org.id, code: 'GFA', name: 'Greenfield Academy, Kolkata', board: 'ICSE', address: 'Salt Lake Sector V', city: 'Kolkata', state: 'West Bengal' },
    });
    await tx.academicYear.create({
      data: { organizationId: org.id, name: '2026-27', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), isCurrent: true },
    });
    for (const n of [6, 7]) {
      const grade = await tx.grade.create({ data: { organizationId: org.id, branchId: branch.id, name: `Class ${n}`, sortOrder: n, medium: 'English' } });
      await tx.section.create({ data: { organizationId: org.id, branchId: branch.id, gradeId: grade.id, name: 'A' } });
    }
    await addUser(tx, org.id, { username: 'admin', name: 'Greenfield Admin', role: 'GROUP_ADMIN', scope: 'ORG' });
    await tx.gradingScale.create({ data: { organizationId: org.id, name: 'CBSE 9-point', bands: JSON.stringify(CBSE_BANDS), isDefault: true } });
    return { orgId: org.id, branch };
  });
  return seedBranch(orgId, branch, { studentsPerSection: 3, teachers: 2, logins: 1 });
}

async function main() {
  passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const dav = await seedDav();
  const greenfield = await seedGreenfield();

  if (dav) {
    console.log('\nDAV (organization: dav)');
    console.log('  organization level: chairman, admin, academic.head, regional.east (East region: Ranchi + Haldia)');
    for (const [code, r] of Object.entries(dav)) console.log(`  ${code}: ${r.students} students · ${r.users.join(', ')}`);
  }
  if (greenfield) {
    console.log('\nGreenfield Academy (organization: greenfield)');
    console.log(`  admin · ${greenfield.students} students · ${greenfield.users.join(', ')}`);
  }
  if (dav || greenfield) console.log(`\nPassword for every demo account: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
