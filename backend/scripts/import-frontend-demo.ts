/**
 * Creates the demo school "Greenwood International School" (subdomain: greenwood) — the school shown on
 * the frontend's /school website — from scripts/demo-data/greenwood.json, the demo data the frontend
 * used before it was connected to the API. Everything is written in one transaction: all of it or nothing.
 *
 *   npm run import:frontend
 *
 * Dates in the snapshot are moved forward to today (so "last week" stays last week); birthdays and
 * festival holidays are kept as they are. Running it again only fills in values that are still empty.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { encryptJson } from "../src/lib/crypto.js";
import { prisma, withSystem, type Tx } from "../src/db/prisma.js";

const ORG_SUBDOMAIN = "greenwood";
const DEMO_PASSWORD = "Demo@1234";

// Store modules read localStorage when they load; in Node they get an empty one and use their seed data.
const memory = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

// ── Small helpers ─────────────────────────────────────────────────────────────

const day = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null);
const mustDay = (s: string) => day(s) ?? new Date();
/** "2026-10-22" + "09:15" in Indian time. */
const istTime = (date: string, time: string) => new Date(`${date}T${time.padStart(5, "0")}:00+05:30`);
const upper = (s?: string | null) => (s ? s.trim().toUpperCase().replace(/[\s-]+/g, "_") : null);
const orNull = (s?: string | null) => (s && String(s).trim() ? String(s).trim() : null);
const num = (s: unknown) => {
  const n = Number(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && String(s ?? "").trim() !== "" ? n : null;
};
const digits10 = (phone?: string) => (phone ?? "").replace(/\D/g, "").slice(-10);
/** "09:30 AM – 12:30 PM" → ["09:30", "12:30"]; "08:00–08:45" → ["08:00", "08:45"]. */
function timeRange(s: string): [string, string] {
  const to24 = (t: string) => {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m) return "00:00";
    let h = Number(m[1]);
    if (m[3]?.toUpperCase() === "PM" && h < 12) h += 12;
    if (m[3]?.toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  };
  const [a, b] = s.split(/[–-]/);
  return [to24(a ?? ""), to24(b ?? "")];
}
const MIME: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", jpg: "image/jpeg", png: "image/png", zip: "application/zip" };
const mimeOf = (file: string) => MIME[file.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
const bytesOf = (size?: string) => {
  const m = (size ?? "").match(/([\d.]+)\s*(KB|MB|GB)/i);
  if (!m) return 0;
  return Math.round(Number(m[1]) * { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[m[2].toUpperCase() as "KB" | "MB" | "GB"]);
};

/** Canonical subject names and codes (timetable short names map onto these). */
const SUBJECT_CODES: Record<string, string> = {
  English: "ENG", Hindi: "HIN", Sanskrit: "SKT", Mathematics: "MATH", Physics: "PHY", Chemistry: "CHEM", Biology: "BIO",
  Science: "SCI", "Social Science": "SST", "Computer Science": "CS", Sociology: "SOC", History: "HIST", Geography: "GEO",
  "Political Science": "POL", "Physical Education": "PE", Art: "ART", Economics: "ECO", Accountancy: "ACC", "Business Studies": "BST",
};
const NAME_BY_CODE = Object.fromEntries(Object.entries(SUBJECT_CODES).map(([n, c]) => [c, n]));
const ALIASES: Record<string, string> = { "Social Sc.": "Social Science", "Computer Sc.": "Computer Science", Maths: "Mathematics", "Phy. Edu.": "Physical Education" };

// ── Load the frontend data ────────────────────────────────────────────────────

const DATE = /^d{4}-d{2}-d{2}(T[d:.]+Z?)?$/;
/** Keys whose dates are real calendar facts, not "n days ago". */
const FIXED_DATES = new Set(["dob", "holidays"]);

/** Moves every date in the snapshot by `days` (deep). */
function shiftDates(value: unknown, days: number, key = ""): unknown {
  if (FIXED_DATES.has(key) || days === 0) return value;
  if (typeof value === "string" && DATE.test(value)) {
    const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
    d.setUTCDate(d.getUTCDate() + days);
    return value.length === 10 ? d.toISOString().slice(0, 10) : d.toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, days, k)]));
  return value;
}

async function loadFrontend() {
  const raw = JSON.parse(readFileSync(new URL("./demo-data/greenwood.json", import.meta.url), "utf8")) as Record<string, Any> & { snapshotDate: string };
  const days = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(raw.snapshotDate)) / 86_400_000);
  const d = shiftDates(raw, days) as Record<string, Any>;
  return {
    students: d.students as Any[],
    teachers: d.teachers as Any[],
    sections: d.sections as Any[],
    marks: d.marks as Record<string, Record<string, Record<string, Record<string, string>>>>,
    attendance: d.attendance as Any[],
    assignments: d.assignments as Any[],
    notes: d.notes as Any[],
    announcements: d.announcements as Any[],
    messages: d.messages as Any[],
    books: d.books as Any[],
    loans: d.loans as Any[],
    items: d.items as Any[],
    movements: d.movements as Any[],
    inventorySettings: d.inventorySettings as Any,
    feePlan: d.feePlan as Record<string, number>,
    payments: d.payments as Any[],
    installments: d.installments as { no: number; name: string; dueDate: string }[],
    lateFeePerDay: d.lateFeePerDay as number,
    expenses: d.expenses as Any[],
    staff: d.staff as Any[],
    leaves: d.leaves as Any[],
    payroll: d.payroll as Any[],
    enquiries: d.enquiries as Any[],
    visitors: d.visitors as Any[],
    exams: d.exams as Any[],
    vehicles: d.vehicles as Any[],
    routes: d.routes as Any[],
    rooms: d.rooms as Any[],
    residents: d.residents as Any[],
    outpasses: d.outpasses as Any[],
    jobs: d.jobs as Any[],
    applications: d.applications as Any[],
    site: d.site as Any,
    feedback: d.feedback as Any[],
    alumni: d.alumni as Any[],
    timetable: d.timetable as Record<string, Any[]>,
    holidays: d.holidays as { name: string; start: string; end: string; type: string }[],
  };
}

// ── Import ────────────────────────────────────────────────────────────────────

async function importAll(tx: Tx, d: Awaited<ReturnType<typeof loadFrontend>>) {
  const counts: Record<string, number> = {};
  const add = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Organization, campuses, years
  const plan = await tx.plan.findFirstOrThrow({ where: { code: "pro" } });
  const orgId = randomUUID();
  const { site } = d;
  await tx.organization.create({
    data: {
      id: orgId, name: site.name, subdomain: ORG_SUBDOMAIN, contactEmail: site.email, contactPhone: site.phone, planId: plan.id, status: "ACTIVE",
      settings: JSON.stringify({ gradingScale: site.board, lateFeePerDay: d.lateFeePerDay, website: site }),
    },
  });
  const mainId = randomUUID();
  const juniorId = randomUUID();
  await tx.branch.createMany({
    data: [
      { id: mainId, organizationId: orgId, code: "GIS-GN", name: `${site.name}, Gomti Nagar`, board: site.board, affiliationNo: site.affiliationNo, address: site.address, city: site.city, state: site.state, phone: site.phone, email: site.email, settings: JSON.stringify({ inventory: d.inventorySettings }) },
      { id: juniorId, organizationId: orgId, code: "GIS-AG", name: `${site.name} Junior Wing, Aliganj`, board: site.board, address: site.branches[1]?.address ?? "Aliganj", city: site.city, state: site.state, phone: site.branches[1]?.phone ?? null },
    ],
  });
  const branchFor = (campus?: string) => (campus && /aliganj|junior/i.test(campus) ? juniorId : mainId);
  const prevYearId = randomUUID();
  const yearId = randomUUID();
  await tx.academicYear.createMany({
    data: [
      { id: prevYearId, organizationId: orgId, name: "2025-26", startDate: mustDay("2025-04-01"), endDate: mustDay("2026-03-31"), isCurrent: false },
      { id: yearId, organizationId: orgId, name: "2026-27", startDate: mustDay("2026-04-01"), endDate: mustDay("2027-03-31"), isCurrent: true },
    ],
  });
  add("branches", 2);

  // Role users (the frontend's shared logins)
  const roleIds = new Map((await tx.role.findMany({ where: { organizationId: null }, select: { id: true, code: true } })).map((r) => [r.code, r.id]));
  const userIds = new Map<string, string>(); // username → id
  const users: Any[] = [];
  const memberships: Any[] = [];
  function addUser(username: string, name: string, roleCode: string, opts: { phone?: string | null; email?: string | null; scope?: "ORG" | "BRANCH" } = {}) {
    const existing = userIds.get(username);
    if (existing) return existing;
    const id = randomUUID();
    userIds.set(username, id);
    users.push({ id, organizationId: orgId, username, name, phone: opts.phone ?? null, email: opts.email ?? null, passwordHash, mustChangePassword: false });
    const scope = opts.scope ?? "BRANCH";
    memberships.push({ id: randomUUID(), organizationId: orgId, userId: id, roleId: roleIds.get(roleCode)!, scopeType: scope, branchId: scope === "BRANCH" ? mainId : null });
    return id;
  }
  const ROLE_USERS: [string, string, string][] = [
    ["admin", "System Admin", "GROUP_ADMIN"], ["principal", site.principalName, "PRINCIPAL"], ["viceprincipal", "Vice Principal", "VICE_PRINCIPAL"],
    ["accountant", "Accounts Office", "ACCOUNTANT"], ["reception", "Front Office", "RECEPTIONIST"], ["exams", "Exam Controller", "EXAM_CONTROLLER"],
    ["hr", "HR Manager", "HR"], ["transport", "Transport In-charge", "TRANSPORT_MANAGER"], ["warden", "Hostel Warden", "HOSTEL_WARDEN"],
    ["librarian", "Librarian", "LIBRARIAN"], ["inventory", "Store In-charge", "INVENTORY_MANAGER"],
  ];
  for (const [u, n, r] of ROLE_USERS) addUser(u, n, r, { scope: r === "GROUP_ADMIN" ? "ORG" : "BRANCH" });
  const U = (u: string) => userIds.get(u)!;

  // Subjects
  const subjects = new Map<string, string>(); // canonical name → id
  const subjectRows: Any[] = [];
  function subjectId(name?: string, code?: string) {
    let canonical = (code && NAME_BY_CODE[code]) || ALIASES[name ?? ""] || (name ?? "General").trim();
    if (!canonical) canonical = "General";
    const found = subjects.get(canonical);
    if (found) return found;
    let c = SUBJECT_CODES[canonical] ?? canonical.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
    while (subjectRows.some((s) => s.code === c)) c = `${c}${subjectRows.length}`;
    const id = randomUUID();
    subjects.set(canonical, id);
    subjectRows.push({ id, organizationId: orgId, code: c, name: canonical });
    return id;
  }

  // Classes & sections ("Class 10-A")
  const grades = new Map<number, string>();
  const sections = new Map<string, string>(); // "10-A" → id
  const gradeRows: Any[] = [];
  const sectionRows: Any[] = [];
  const gradeNo = (cls: string) => Number(cls.replace(/\D+/g, " ").trim().split(" ")[0]);
  function sectionKey(cls: string) {
    const m = cls.replace(/^Class\s*/i, "").match(/^(\d+)\s*-\s*([A-Za-z]+)$/);
    return m ? `${Number(m[1])}-${m[2].toUpperCase()}` : null;
  }
  function ensureSection(cls: string, capacity = 40) {
    const key = sectionKey(cls);
    if (!key) return null;
    const existing = sections.get(key);
    if (existing) return existing;
    const [g, s] = key.split("-");
    let gradeId = grades.get(Number(g));
    if (!gradeId) {
      gradeId = randomUUID();
      grades.set(Number(g), gradeId);
      gradeRows.push({ id: gradeId, organizationId: orgId, branchId: mainId, name: `Class ${g}`, sortOrder: Number(g), medium: "English" });
    }
    const id = randomUUID();
    sections.set(key, id);
    sectionRows.push({ id, organizationId: orgId, branchId: mainId, gradeId, name: s, capacity });
    return id;
  }
  for (const s of d.sections) ensureSection(`${s.className}-${s.section}`, s.capacity ?? 40);
  for (const s of d.students) ensureSection(s.class);

  // Staff: teachers, non-teaching staff, and teachers named only in timetables / class lists
  const staffRows: Any[] = [];
  const staffByCode = new Map<string, string>();
  const staffByName = new Map<string, string>();
  const teacherUserByName = new Map<string, string>();
  const teacherUserByCode = new Map<string, string>();
  const teacherStaffById = new Map<number, string>();
  const staffStaffById = new Map<number, string>();
  const mapEmployment = (t?: string) => ({ Permanent: "PERMANENT", Probation: "PROBATION", Contract: "CONTRACT", "Part-Time": "PART_TIME", "Guest Faculty": "GUEST" })[t ?? ""] ?? upper(t);
  const SENSITIVE = new Set(["aadhar", "pan", "bankName", "accountNo", "ifscCode", "branchName", "accountType", "id", "empId", "name", "gender", "dob", "phone", "email", "designation", "department", "employmentType", "joiningDate", "status", "basicSalary", "hra", "da", "ta", "otherAllowances", "initials"]);
  for (const t of d.teachers) {
    const id = randomUUID();
    const userId = addUser(t.empId, t.name, "TEACHER", { phone: orNull(t.phone), email: orNull(t.email) });
    const profile = Object.fromEntries(Object.entries(t).filter(([k]) => !SENSITIVE.has(k)));
    profile.aadhaarLast4 = String(t.aadhar ?? "").replace(/\D/g, "").slice(-4) || null;
    staffRows.push({
      id, organizationId: orgId, branchId: mainId, userId, employeeCode: t.empId, name: t.name, gender: upper(t.gender), dob: day(t.dob),
      phone: orNull(t.phone), email: orNull(t.email), staffType: "TEACHING", designation: t.designation || "Teacher", department: orNull(t.department),
      employmentType: mapEmployment(t.employmentType), joiningDate: day(t.joiningDate), status: upper(t.status) ?? "ACTIVE", basicSalary: num(t.basicSalary),
      allowances: JSON.stringify({ hra: num(t.hra), da: num(t.da), ta: num(t.ta), other: num(t.otherAllowances) }), profile: JSON.stringify(profile),
    });
    staffByCode.set(t.empId, id);
    staffByName.set(t.name, id);
    teacherUserByName.set(t.name, userId);
    teacherUserByCode.set(t.empId, userId);
    teacherStaffById.set(t.id, id);
  }
  for (const s of d.staff) {
    const id = randomUUID();
    staffRows.push({
      id, organizationId: orgId, branchId: mainId, employeeCode: s.empId, name: s.name, phone: orNull(s.phone), email: orNull(s.email), staffType: "NON_TEACHING",
      designation: s.designation, department: orNull(s.department), employmentType: "PERMANENT", joiningDate: day(s.joiningDate), status: upper(s.status) ?? "ACTIVE", basicSalary: num(s.salary),
    });
    staffByCode.set(s.empId, id);
    staffByName.set(s.name, id);
    staffStaffById.set(s.id, id);
  }
  let extraTeacherNo = 0;
  function teacherByName(name?: string, code?: string, department?: string) {
    if (!name) return null;
    const found = staffByName.get(name) ?? (code ? staffByCode.get(code) : undefined);
    if (found) return found;
    const id = randomUUID();
    let employeeCode = code && !staffByCode.has(code) ? code : `TX${String(++extraTeacherNo).padStart(3, "0")}`;
    while (staffByCode.has(employeeCode)) employeeCode = `TX${String(++extraTeacherNo).padStart(3, "0")}`;
    staffRows.push({ id, organizationId: orgId, branchId: mainId, employeeCode, name, staffType: "TEACHING", designation: "Teacher", department: orNull(department), status: "ACTIVE", profile: JSON.stringify({ source: "timetable / class list (no login)" }) });
    staffByCode.set(employeeCode, id);
    staffByName.set(name, id);
    return id;
  }
  const userForTeacher = (name?: string, code?: string) => (name && teacherUserByName.get(name)) || (code && teacherUserByCode.get(code)) || U("principal");

  // Class teachers: the teacher's own "class teacher of", else the section list's name
  const sectionTeacher = new Map<string, string>();
  for (const t of d.teachers) {
    const key = t.classTeacherOf && sectionKey(t.classTeacherOf);
    if (key && sections.has(key)) sectionTeacher.set(key, teacherStaffById.get(t.id)!);
  }
  for (const s of d.sections) {
    const key = sectionKey(`${s.className}-${s.section}`)!;
    if (!sectionTeacher.has(key) && s.classTeacher) sectionTeacher.set(key, teacherByName(s.classTeacher)!);
  }
  for (const row of sectionRows) {
    const g = gradeRows.find((x) => x.id === row.gradeId)!;
    row.classTeacherId = sectionTeacher.get(`${g.sortOrder}-${row.name}`) ?? null;
  }

  // Students, enrollments, guardians, logins
  const studentIds = new Map<number, string>();
  const studentRows: Any[] = [];
  const enrollmentRows: Any[] = [];
  const guardianRows: Any[] = [];
  const linkRows: Any[] = [];
  const guardianByKey = new Map<string, string>();
  const parentUserByStudent = new Map<number, string>();
  const studentUser = new Map<number, string>();
  const STUDENT_PROFILE_KEYS = ["nationality", "medium", "birthCertNo", "email", "phone", "sports", "arts", "otherActivities", "feeCategory", "needsTransport", "busRoute", "busStop", "pickupAddress", "docBirthCert", "docAadhar", "docTC", "docMarksheet", "docPhotos", "docCasteCert", "admissionClass", "admissionSection"];
  for (const s of d.students) {
    const id = randomUUID();
    studentIds.set(s.id, id);
    const userId = addUser(s.admissionNo, s.name, "STUDENT", { email: orNull(s.email), phone: orNull(s.phone) });
    studentUser.set(s.id, userId);
    studentRows.push({
      id, organizationId: orgId, branchId: mainId, userId, admissionNo: s.admissionNo, firstName: s.firstName || s.name.split(" ")[0],
      middleName: orNull(s.middleName), lastName: orNull(s.lastName) ?? (s.firstName ? null : s.name.split(" ").slice(1).join(" ") || null),
      gender: upper(s.gender), dob: day(s.dob), bloodGroup: orNull(s.bloodGroup), category: upper(s.category), religion: orNull(s.religion),
      aadhaarLast4: String(s.aadharNo ?? "").replace(/\D/g, "").slice(-4) || null, admissionDate: day(s.admissionDate), status: "ACTIVE",
      address: JSON.stringify({
        present: { line: s.presentAddress, city: s.presentCity, state: s.presentState, pincode: s.presentPincode },
        permanent: { line: s.permanentAddress, city: s.permanentCity, state: s.permanentState, pincode: s.permanentPincode },
      }),
      health: JSON.stringify({ height: s.height, weight: s.weight, medicalCondition: s.medicalCondition, allergies: s.allergies, doctorName: s.doctorName, doctorPhone: s.doctorPhone }),
      previousSchool: s.prevSchoolName ? JSON.stringify({ name: s.prevSchoolName, board: s.prevSchoolBoard, class: s.prevClass, percentage: s.prevPercentage, tcNo: s.tcNo }) : null,
      profile: JSON.stringify(Object.fromEntries(STUDENT_PROFILE_KEYS.map((k) => [k, s[k]]))),
    });
    const sectionId = ensureSection(s.class)!;
    enrollmentRows.push({ id: randomUUID(), organizationId: orgId, branchId: mainId, studentId: id, academicYearId: yearId, sectionId, rollNo: s.rollNo, status: "ACTIVE" });

    const parents = [
      { relation: "FATHER", name: s.fatherName, phone: s.fatherPhone, email: s.fatherEmail, occupation: s.fatherOccupation, income: s.fatherAnnualIncome },
      { relation: "MOTHER", name: s.motherName, phone: s.motherPhone, email: s.motherEmail, occupation: s.motherOccupation, income: null },
    ].filter((p) => orNull(p.name) && orNull(p.phone));
    parents.forEach((p, i) => {
      const key = `${digits10(p.phone)}|${p.name.trim().toLowerCase()}`;
      let gid = guardianByKey.get(key);
      if (!gid) {
        gid = randomUUID();
        guardianByKey.set(key, gid);
        const userId = i === 0 ? addUser(digits10(p.phone), p.name, "PARENT", { phone: p.phone, email: orNull(p.email) }) : null;
        guardianRows.push({ id: gid, organizationId: orgId, userId, name: p.name, phone: p.phone, email: orNull(p.email), occupation: orNull(p.occupation), annualIncome: orNull(p.income) });
      }
      linkRows.push({ organizationId: orgId, studentId: id, guardianId: gid, relation: p.relation, isPrimary: i === 0 });
      if (i === 0) parentUserByStudent.set(s.id, userIds.get(digits10(p.phone))!);
    });
  }

  // Fee plans & installments (current year), concessions, payments
  const feePlanRows: Any[] = [];
  const installmentRows: Any[] = [];
  const installmentFor = new Map<string, string>(); // `${grade}|${no}` → id
  const pct = [33.33, 33.33, 33.34];
  for (const [g, amount] of Object.entries(d.feePlan)) {
    const gradeId = grades.get(Number(g));
    if (!gradeId) continue;
    const planId = randomUUID();
    feePlanRows.push({ id: planId, organizationId: orgId, branchId: mainId, academicYearId: yearId, gradeId, feeHead: "TUITION", annualAmount: amount });
    d.installments.forEach((ins, i) => {
      const iid = randomUUID();
      installmentFor.set(`${g}|${ins.no}`, iid);
      installmentRows.push({ id: iid, organizationId: orgId, feePlanId: planId, installmentNo: ins.no, name: ins.name, dueDate: mustDay(ins.dueDate), percent: pct[i] ?? 0 });
    });
  }
  const CONCESSION: Record<string, string> = { Merit: "MERIT", "Need Based": "NEED_BASED", RTE: "RTE", "OBC Concession": "CATEGORY", Sibling: "SIBLING", "Staff Ward": "STAFF_WARD" };
  const concessionRows = d.students
    .filter((s) => num(s.concessionPercent) && s.concessionType && s.concessionType !== "None")
    .map((s) => ({ id: randomUUID(), organizationId: orgId, studentId: studentIds.get(s.id)!, academicYearId: yearId, type: CONCESSION[s.concessionType] ?? upper(s.concessionType)!, percent: num(s.concessionPercent)!, approvedById: U("principal") }));
  const PAY_METHOD: Record<string, string> = { UPI: "UPI", "Net Banking": "NETBANKING", "Credit Card": "CARD", "Debit Card": "CARD", Cash: "CASH", Cheque: "CHEQUE" };
  const studentGrade = new Map(d.students.map((s) => [s.id, gradeNo(s.class)]));
  const paymentRows = d.payments
    .filter((p) => p.amount > 0 && studentIds.has(p.studentId) && installmentFor.has(`${studentGrade.get(p.studentId)}|${p.installment}`))
    .map((p, i) => ({
      id: randomUUID(), organizationId: orgId, branchId: mainId, studentId: studentIds.get(p.studentId)!, installmentId: installmentFor.get(`${studentGrade.get(p.studentId)}|${p.installment}`)!,
      amount: p.amount, lateFee: p.lateFee ?? 0, method: PAY_METHOD[p.method] ?? upper(p.method)!, status: "SUCCESS", receiptNo: `GIS/26/${String(i + 1).padStart(6, "0")}`,
      gatewayRef: orNull(p.txnId), idempotencyKey: `frontend-import-${p.id}`, receivedById: p.method === "Cash" ? U("accountant") : null, paidAt: mustDay(p.date),
    }));

  // Timetable: section ↔ subject ↔ teacher, then periods Monday–Saturday
  const sectionSubjects = new Map<string, Any>(); // `${sectionId}|${subjectId}`
  function sectionSubject(sectionId: string, subjId: string, teacherId: string | null) {
    const key = `${sectionId}|${subjId}`;
    let row = sectionSubjects.get(key);
    if (!row) {
      row = { id: randomUUID(), organizationId: orgId, branchId: mainId, academicYearId: yearId, sectionId, subjectId: subjId, teacherId };
      sectionSubjects.set(key, row);
    } else if (!row.teacherId && teacherId) row.teacherId = teacherId;
    return row.id as string;
  }
  for (const t of d.teachers) {
    for (const cs of t.classSubjects ?? []) {
      const g = gradeNo(String(cs.className));
      for (const [key, sid] of sections) if (Number(key.split("-")[0]) === g) for (const subj of cs.subjects) sectionSubject(sid, subjectId(subj), teacherStaffById.get(t.id)!);
    }
  }
  const periodRows: Any[] = [];
  for (const [cls, periods] of Object.entries(d.timetable)) {
    const sid = ensureSection(cls);
    if (!sid) continue;
    for (const p of periods) {
      const ssId = sectionSubject(sid, subjectId(p.subjectName, p.subjectCode), teacherByName(p.teacherName, p.teacherId, p.subjectName));
      const [startTime, endTime] = timeRange(p.timeSlot);
      for (let dow = 1; dow <= 6; dow++) periodRows.push({ id: randomUUID(), organizationId: orgId, branchId: mainId, sectionSubjectId: ssId, dayOfWeek: dow, periodNo: p.periodNo, startTime, endTime });
    }
  }

  // Exams, papers, marks
  const examRows: Any[] = [];
  const paperRows: Any[] = [];
  const paperFor = new Map<string, string>(); // `${examName}|${subjectId}`
  const examByName = new Map<string, Any>();
  for (const e of d.exams) {
    const id = randomUUID();
    examByName.set(e.name, { id, firstDate: e.papers[0]?.date });
    examRows.push({ id, organizationId: orgId, branchId: mainId, academicYearId: yearId, name: e.name, gradeNames: e.grades.map((g: number) => `Class ${g}`).join(","), resultsPublished: !!e.resultsPublished, publishedAt: e.resultsPublished ? mustDay(e.papers.at(-1)?.date ?? "2026-04-01") : null });
    for (const p of e.papers) {
      const pid = randomUUID();
      const sid = subjectId(p.subject);
      const [startTime, endTime] = timeRange(p.time);
      paperFor.set(`${e.name}|${sid}`, pid);
      paperRows.push({ id: pid, organizationId: orgId, examId: id, subjectId: sid, date: mustDay(p.date), startTime, endTime, maxMarks: 100, passMarks: 33 });
    }
  }
  const markRows: Any[] = [];
  for (const [cls, byExam] of Object.entries(d.marks)) {
    for (const [examName, bySubject] of Object.entries(byExam)) {
      let exam = examByName.get(examName);
      if (!exam) {
        const id = randomUUID();
        exam = { id, firstDate: null };
        examByName.set(examName, exam);
        examRows.push({ id, organizationId: orgId, branchId: mainId, academicYearId: yearId, name: examName, gradeNames: `Class ${gradeNo(cls)}`, resultsPublished: false });
      }
      for (const [subject, byStudent] of Object.entries(bySubject)) {
        const sid = subjectId(subject);
        let pid = paperFor.get(`${examName}|${sid}`);
        if (!pid) {
          pid = randomUUID();
          paperFor.set(`${examName}|${sid}`, pid);
          paperRows.push({ id: pid, organizationId: orgId, examId: exam.id, subjectId: sid, date: mustDay(exam.firstDate ?? "2026-04-01"), startTime: "09:30", endTime: "12:30", maxMarks: 100, passMarks: 33 });
        }
        for (const [stuId, value] of Object.entries(byStudent)) {
          const studentId = studentIds.get(Number(stuId));
          if (!studentId || value === "" || value == null) continue;
          const absent = /^a(b|bsent)?$/i.test(String(value).trim());
          markRows.push({ id: randomUUID(), organizationId: orgId, branchId: mainId, examPaperId: pid, studentId, marks: absent ? null : num(value), isAbsent: absent, enteredById: U("exams") });
        }
      }
    }
  }

  // Attendance
  const sessionRows: Any[] = [];
  const entryRows: Any[] = [];
  const seenSession = new Set<string>();
  for (const rec of d.attendance) {
    const sid = ensureSection(rec.className);
    if (!sid) continue;
    for (const p of rec.periods ?? []) {
      const key = `${sid}|${rec.date}|${p.periodNo}`;
      if (seenSession.has(key)) continue;
      seenSession.add(key);
      const id = randomUUID();
      teacherByName(p.teacherName, p.teacherId, p.subjectName);
      sessionRows.push({ id, organizationId: orgId, branchId: mainId, sectionId: sid, date: mustDay(rec.date), periodNo: p.periodNo, subjectId: subjectId(p.subjectName, p.subjectCode), takenById: userForTeacher(p.teacherName, p.teacherId) });
      const seenStudent = new Set<string>();
      for (const e of p.entries ?? []) {
        const studentId = studentIds.get(Number(e.studentId));
        if (!studentId || seenStudent.has(studentId)) continue;
        seenStudent.add(studentId);
        entryRows.push({ organizationId: orgId, sessionId: id, studentId, status: upper(e.status) ?? "PRESENT" });
      }
    }
  }

  // Files (demo placeholders — the frontend never stored real file contents)
  const attachmentRows: Any[] = [];
  function attachment(fileName: string, uploadedById: string, size?: string) {
    const id = randomUUID();
    attachmentRows.push({ id, organizationId: orgId, branchId: mainId, fileName, mimeType: mimeOf(fileName), sizeBytes: bytesOf(size), storageKey: `demo/${fileName}`, uploadedById });
    return id;
  }

  // Assignments & submissions, study notes
  const assignmentRows: Any[] = [];
  const submissionRows: Any[] = [];
  for (const a of d.assignments) {
    const sid = ensureSection(a.class);
    if (!sid) continue;
    const id = randomUUID();
    assignmentRows.push({ id, organizationId: orgId, branchId: mainId, sectionId: sid, subjectId: subjectId(a.subject), teacherId: teacherByName(a.teacher, undefined, a.subject)!, title: a.title, description: orNull(a.description), assignedDate: mustDay(a.assignedDate), dueDate: mustDay(a.dueDate), totalMarks: a.totalMarks ?? 0 });
    const seen = new Set<string>();
    for (const s of a.submissions ?? []) {
      const studentId = studentIds.get(Number(s.studentId));
      if (!studentId || seen.has(studentId)) continue;
      seen.add(studentId);
      submissionRows.push({
        id: randomUUID(), organizationId: orgId, assignmentId: id, studentId, submittedAt: mustDay(s.submittedAt),
        fileId: s.fileName ? attachment(s.fileName, studentUser.get(Number(s.studentId))!) : null,
        marksObtained: s.marksObtained ?? null, feedback: orNull(s.feedback), gradedById: s.marksObtained != null ? userForTeacher(a.teacher) : null,
      });
    }
  }
  const noteRows = d.notes
    .map((n) => {
      const sid = ensureSection(n.class);
      if (!sid) return null;
      return {
        id: randomUUID(), organizationId: orgId, branchId: mainId, sectionId: sid, subjectId: subjectId(n.subject), uploadedById: teacherByName(n.uploadedBy, undefined, n.subject)!,
        title: n.title, description: orNull(n.description), fileId: attachment(n.fileName || `${n.title}.pdf`, userForTeacher(n.uploadedBy), n.fileSize), downloads: n.downloads ?? 0, createdAt: mustDay(n.uploadDate),
      };
    })
    .filter(Boolean);

  // Announcements & messages
  const announcementRows: Any[] = [];
  const audienceRows: Any[] = [];
  const OFFICE_USER: Record<string, string> = { "Accounts Office": "accountant", Library: "librarian" };
  for (const a of d.announcements) {
    const id = randomUUID();
    const createdById = a.fromRole === "principal" ? U("principal") : a.fromRole === "teacher" ? userForTeacher(a.from) : U(OFFICE_USER[a.from] ?? "reception");
    announcementRows.push({ id, organizationId: orgId, branchId: mainId, title: a.title, body: a.content, category: upper(a.category) ?? "GENERAL", priority: upper(a.priority) ?? "MEDIUM", createdById, createdAt: mustDay(a.date) });
    for (const t of a.audience as string[]) {
      const type = ({ everyone: "EVERYONE", staff: "STAFF", students: "STUDENTS", parents: "PARENTS" } as Record<string, string>)[t];
      if (type) audienceRows.push({ id: randomUUID(), organizationId: orgId, announcementId: id, audienceType: type });
      else {
        const sid = ensureSection(t);
        if (sid) audienceRows.push({ id: randomUUID(), organizationId: orgId, announcementId: id, audienceType: "SECTION", sectionId: sid });
      }
    }
  }
  const teacherUserById = new Map(d.teachers.map((t) => [t.id, teacherUserByCode.get(t.empId)!]));
  const participantUser = (p: Any) =>
    p.role === "student" ? studentUser.get(p.id) : p.role === "teacher" ? teacherUserById.get(p.id) : p.role === "parent" ? parentUserByStudent.get(p.id) : p.role === "principal" ? U("principal") : U("reception");
  const messageRows = d.messages
    .map((m) => {
      const fromUserId = participantUser(m.from);
      const toUserId = participantUser(m.to);
      if (!fromUserId || !toUserId) return null;
      const child = [m.from, m.to].find((p: Any) => p.role === "student" || p.role === "parent");
      const sentAt = new Date(m.sentAt);
      return { id: randomUUID(), organizationId: orgId, fromUserId, toUserId, aboutStudentId: child ? studentIds.get(child.id) ?? null : null, subject: m.subject, body: m.body, sentAt, readAt: m.read ? sentAt : null };
    })
    .filter(Boolean);

  // Library
  const bookIds = new Map<number, string>();
  const bookRows = d.books.map((b) => {
    const id = randomUUID();
    bookIds.set(b.id, id);
    return { id, organizationId: orgId, branchId: mainId, title: b.title, author: b.author, isbn: orNull(b.isbn), category: b.category, publisher: orNull(b.publisher), edition: orNull(b.edition), publishYear: b.publishYear ?? null, totalCopies: b.totalCopies, rack: orNull(b.rack) };
  });
  const loanRows = d.loans
    .filter((l) => bookIds.has(l.bookId))
    .map((l) => ({ id: randomUUID(), organizationId: orgId, branchId: mainId, bookId: bookIds.get(l.bookId)!, studentId: studentIds.get(l.studentId) ?? null, issueDate: mustDay(l.issueDate), dueDate: mustDay(l.dueDate), returnDate: day(l.returnDate), finePaid: l.finePaid ?? 0 }));

  // Inventory
  const itemIds = new Map<number, string>();
  const itemRows = d.items.map((it) => {
    const id = randomUUID();
    itemIds.set(it.id, id);
    return { id, organizationId: orgId, branchId: mainId, sku: it.sku, name: it.name, category: it.category, unit: it.unit, location: it.location, quantity: it.quantity, minQuantity: it.minQuantity, unitPrice: it.unitPrice, condition: upper(it.condition) ?? "GOOD" };
  });
  const movementRows = d.movements
    .filter((m) => itemIds.has(m.itemId))
    .map((m) => ({ id: randomUUID(), organizationId: orgId, itemId: itemIds.get(m.itemId)!, type: m.type === "in" ? "IN" : "OUT", quantity: m.quantity, note: [m.note, m.by && `by ${m.by}`].filter(Boolean).join(" · ") || null, createdById: U("inventory"), createdAt: mustDay(m.date) }));

  // Accounts & HR
  const EXPENSE_METHOD: Record<string, string> = { UPI: "UPI", "Bank Transfer": "BANK_TRANSFER", Cheque: "CHEQUE", Cash: "CASH" };
  const expenseRows = d.expenses.map((e) => ({ id: randomUUID(), organizationId: orgId, branchId: mainId, date: mustDay(e.date), category: e.category, description: e.description, amount: e.amount, paidTo: orNull(e.paidTo), method: EXPENSE_METHOD[e.method] ?? upper(e.method)!, createdById: U("accountant") }));
  const staffFor = (kind: string, id: number) => (kind === "teacher" ? teacherStaffById.get(id) : staffStaffById.get(id));
  const leaveRows = d.leaves
    .map((l) => {
      const staffId = staffFor(l.person.kind, l.person.id);
      if (!staffId) return null;
      const decided = l.status !== "Pending";
      return { id: randomUUID(), organizationId: orgId, branchId: mainId, staffId, type: upper(l.type) ?? "CASUAL", fromDate: mustDay(l.from), toDate: mustDay(l.to), reason: l.reason, status: upper(l.status) ?? "PENDING", decidedById: decided ? U("principal") : null, decidedAt: decided ? mustDay(l.appliedOn) : null, createdAt: mustDay(l.appliedOn) };
    })
    .filter(Boolean);
  const payrollRows: Any[] = [];
  const payslipRows: Any[] = [];
  for (const run of d.payroll) {
    const id = randomUUID();
    payrollRows.push({ id, organizationId: orgId, branchId: mainId, month: run.month, status: run.paidOn ? "PAID" : "PROCESSED", processedAt: mustDay(run.processedOn ?? `${run.month}-28`), paidAt: day(run.paidOn) });
    for (const line of run.lines) {
      const staffId = staffFor(line.kind, line.id);
      if (staffId) payslipRows.push({ id: randomUUID(), organizationId: orgId, payrollRunId: id, staffId, gross: line.gross, deductions: line.deductions, net: line.net, breakdown: JSON.stringify(line) });
    }
  }

  // Front office
  const enquiryRows = d.enquiries.map((e) => ({ id: randomUUID(), organizationId: orgId, branchId: mainId, studentName: e.studentName, parentName: e.parentName, phone: e.phone, email: orNull(e.email), gradeName: /^\d+$/.test(e.grade) ? `Class ${e.grade}` : e.grade, source: e.source, status: upper(e.status) ?? "NEW", notes: orNull(e.notes), followUpDate: day(e.followUp), createdAt: mustDay(e.date) }));
  const visitorRows = d.visitors.map((v) => ({ id: randomUUID(), organizationId: orgId, branchId: mainId, name: v.name, phone: orNull(v.phone), purpose: v.purpose, toMeet: v.toMeet, people: v.people ?? 1, inAt: istTime(v.date, v.inTime), outAt: v.outTime ? istTime(v.date, v.outTime) : null }));

  // Transport (drivers become staff records), stops, student allocations
  let driverNo = 0;
  const vehicleIds = new Map<number, string>();
  const vehicleRows = d.vehicles.map((v) => {
    const id = randomUUID();
    vehicleIds.set(v.id, id);
    let driverStaffId: string | null = staffByName.get(v.driverName) ?? null;
    if (!driverStaffId && v.driverName) {
      driverStaffId = randomUUID();
      const code = `DRV${String(++driverNo).padStart(3, "0")}`;
      staffRows.push({ id: driverStaffId, organizationId: orgId, branchId: mainId, employeeCode: code, name: v.driverName, phone: orNull(v.driverPhone), staffType: "NON_TEACHING", designation: "Driver", department: "Transport", employmentType: "PERMANENT", status: "ACTIVE" });
      staffByName.set(v.driverName, driverStaffId);
    }
    return { id, organizationId: orgId, branchId: mainId, registrationNo: v.number, type: upper(v.type) ?? "BUS", capacity: v.capacity, driverStaffId, insuranceExpiry: mustDay(v.insuranceExpiry), fitnessExpiry: mustDay(v.fitnessExpiry) };
  });
  const routeRows: Any[] = [];
  const stopRows: Any[] = [];
  const stopFor = new Map<string, string>(); // `${route}|${stop}`
  for (const r of d.routes) {
    const id = randomUUID();
    routeRows.push({ id, organizationId: orgId, branchId: mainId, name: r.name, vehicleId: vehicleIds.get(r.vehicleId) ?? null, monthlyFee: r.monthlyFee, pickupTime: r.pickupTime });
    (r.stops as string[]).forEach((s, i) => {
      const sid = randomUUID();
      stopFor.set(`${r.name}|${s}`, sid);
      stopRows.push({ id: sid, organizationId: orgId, routeId: id, name: s, sortOrder: i + 1 });
    });
  }
  const allocationRows = d.students
    .filter((s) => s.needsTransport && stopFor.has(`${s.busRoute}|${s.busStop}`))
    .map((s) => ({ id: randomUUID(), organizationId: orgId, studentId: studentIds.get(s.id)!, academicYearId: yearId, stopId: stopFor.get(`${s.busRoute}|${s.busStop}`)! }));

  // Hostel
  const roomIds = new Map<number, string>();
  const roomRows = d.rooms.map((r) => {
    const id = randomUUID();
    roomIds.set(r.id, id);
    return { id, organizationId: orgId, branchId: mainId, block: r.block, number: r.number, capacity: r.capacity, type: upper(r.type) ?? "BOYS" };
  });
  const hostelRows = d.residents
    .filter((r) => roomIds.has(r.roomId) && studentIds.has(r.studentId))
    .map((r) => ({ id: randomUUID(), organizationId: orgId, roomId: roomIds.get(r.roomId)!, studentId: studentIds.get(r.studentId)!, fromDate: mustDay(r.since) }));
  const outpassRows = d.outpasses
    .filter((o) => studentIds.has(o.studentId))
    .map((o) => ({ id: randomUUID(), organizationId: orgId, branchId: mainId, studentId: studentIds.get(o.studentId)!, fromDate: mustDay(o.from), toDate: mustDay(o.to), reason: o.reason, status: upper(o.status) ?? "PENDING", decidedById: o.status === "Pending" ? null : U("warden"), createdAt: mustDay(o.requestedOn) }));

  // Website: recruitment, messages, alumni (site content is in Organization.settings)
  const JOB_CATEGORY: Record<string, string> = { Teaching: "TEACHING", "Non-Teaching": "NON_TEACHING", Administration: "ADMINISTRATION", "Support Staff": "SUPPORT" };
  const JOB_TYPE: Record<string, string> = { "Full-time": "FULL_TIME", "Part-time": "PART_TIME", Contract: "CONTRACT", "Guest Faculty": "GUEST" };
  const jobIds = new Map<number, string>();
  const jobRows = d.jobs.map((j) => {
    const id = randomUUID();
    jobIds.set(j.id, id);
    return {
      id, organizationId: orgId, branchId: branchFor(j.campus), campus: orNull(j.campus), title: j.title, department: j.department, category: JOB_CATEGORY[j.category] ?? upper(j.category)!, employmentType: JOB_TYPE[j.employmentType] ?? upper(j.employmentType)!,
      vacancies: j.vacancies, qualification: j.qualification, experience: orNull(j.experience), salary: orNull(j.salary), description: j.description, responsibilities: JSON.stringify(j.responsibilities ?? []),
      postedOn: mustDay(j.postedOn), lastDate: mustDay(j.lastDate), isOpen: !!j.isOpen,
    };
  });
  const applicationRows = d.applications.map((a) => ({
    id: randomUUID(), organizationId: orgId, branchId: a.jobId ? jobRows.find((j) => j.id === jobIds.get(a.jobId))?.branchId ?? mainId : mainId, jobOpeningId: a.jobId ? jobIds.get(a.jobId) ?? null : null,
    name: a.name, email: a.email, phone: a.phone, qualification: a.qualification, experienceYears: a.experienceYears ?? 0, currentEmployer: orNull(a.currentEmployer === "—" ? "" : a.currentEmployer),
    expectedSalary: orNull(a.expectedSalary), coverLetter: orNull(a.coverLetter), resumeFileId: a.resumeName ? attachment(a.resumeName, U("hr")) : null, status: upper(a.status) ?? "APPLIED",
    interviewDate: day(a.interviewDate), notes: orNull(a.notes), appliedAt: mustDay(a.appliedOn),
  }));
  const contactRows = d.feedback.map((f) => ({ id: randomUUID(), organizationId: orgId, branchId: mainId, kind: upper(f.kind) ?? "CONTACT", name: f.name, phone: f.phone, email: orNull(f.email), subject: f.subject, message: f.message, resolved: !!f.resolved, createdAt: mustDay(f.date) }));
  const alumniRows = d.alumni.map((a) => ({ id: randomUUID(), organizationId: orgId, name: a.name, batchYear: Number(a.batch), email: a.email, phone: orNull(a.phone), occupation: orNull(a.occupation), city: orNull(a.city), createdAt: mustDay(a.date) }));

  // ── Write, parents before children ──
  const write = async (label: string, model: Any, rows: Any[]) => {
    if (rows.length) await model.createMany({ data: rows });
    add(label, rows.length);
  };
  await write("users", tx.user, users);
  await write("memberships", tx.membership, memberships);
  await write("subjects", tx.subject, subjectRows);
  await write("grades", tx.grade, gradeRows);
  await write("staff", tx.staff, staffRows);
  await write("sections", tx.section, sectionRows);
  await write("students", tx.student, studentRows);
  await write("enrollments", tx.enrollment, enrollmentRows);
  await write("guardians", tx.guardian, guardianRows);
  await write("studentGuardians", tx.studentGuardian, linkRows);
  await write("feePlans", tx.feePlan, feePlanRows);
  await write("feeInstallments", tx.feeInstallment, installmentRows);
  await write("feeConcessions", tx.feeConcession, concessionRows);
  await write("feePayments", tx.feePayment, paymentRows);
  await write("sectionSubjects", tx.sectionSubject, [...sectionSubjects.values()]);
  await write("timetablePeriods", tx.timetablePeriod, periodRows);
  await write("exams", tx.exam, examRows);
  await write("examPapers", tx.examPaper, paperRows);
  await write("marks", tx.mark, markRows);
  await write("attendanceSessions", tx.attendanceSession, sessionRows);
  await write("attendanceEntries", tx.attendanceEntry, entryRows);
  await write("attachments", tx.attachment, attachmentRows);
  await write("assignments", tx.assignment, assignmentRows);
  await write("submissions", tx.assignmentSubmission, submissionRows);
  await write("studyNotes", tx.studyNote, noteRows);
  await write("announcements", tx.announcement, announcementRows);
  await write("announcementAudiences", tx.announcementAudience, audienceRows);
  await write("messages", tx.message, messageRows);
  await write("books", tx.book, bookRows);
  await write("bookLoans", tx.bookLoan, loanRows);
  await write("inventoryItems", tx.inventoryItem, itemRows);
  await write("stockMovements", tx.stockMovement, movementRows);
  await write("expenses", tx.expense, expenseRows);
  await write("leaveRequests", tx.leaveRequest, leaveRows);
  await write("payrollRuns", tx.payrollRun, payrollRows);
  await write("payslips", tx.payslip, payslipRows);
  await write("enquiries", tx.enquiry, enquiryRows);
  await write("visitors", tx.visitor, visitorRows);
  await write("vehicles", tx.vehicle, vehicleRows);
  await write("transportRoutes", tx.transportRoute, routeRows);
  await write("routeStops", tx.routeStop, stopRows);
  await write("transportAllocations", tx.transportAllocation, allocationRows);
  await write("hostelRooms", tx.hostelRoom, roomRows);
  await write("hostelAllocations", tx.hostelAllocation, hostelRows);
  await write("outpasses", tx.outpass, outpassRows);
  await write("jobOpenings", tx.jobOpening, jobRows);
  await write("jobApplications", tx.jobApplication, applicationRows);
  await write("contactMessages", tx.contactMessage, contactRows);
  await write("alumni", tx.alumniMember, alumniRows);
  await tx.auditLog.create({ data: { organizationId: orgId, userId: U("admin"), action: "CREATE", entity: "Import", entityId: orgId, after: JSON.stringify({ source: "frontend demo data", counts }) } });
  return counts;
}

/** CBSE 9-point scale; every organization gets it as its default. */
export const CBSE_BANDS = [
  { min: 91, max: 100, grade: "A1", point: 10 }, { min: 81, max: 90, grade: "A2", point: 9 }, { min: 71, max: 80, grade: "B1", point: 8 },
  { min: 61, max: 70, grade: "B2", point: 7 }, { min: 51, max: 60, grade: "C1", point: 6 }, { min: 41, max: 50, grade: "C2", point: 5 },
  { min: 33, max: 40, grade: "D", point: 4 }, { min: 0, max: 32, grade: "E", point: 0, remark: "Needs improvement" },
];

/**
 * Fills what the first import version left out, and is safe to repeat: encrypted Aadhaar / PAN / bank
 * details, the year's holidays, a default grading scale and job campuses. Only touches empty values.
 */
async function enrich(tx: Tx, d: Awaited<ReturnType<typeof loadFrontend>>) {
  const org = await tx.organization.findUniqueOrThrow({ where: { subdomain: ORG_SUBDOMAIN }, select: { id: true } });
  const counts: Record<string, number> = { studentAadhaar: 0, staffSensitive: 0, staffBank: 0, holidays: 0, gradingScales: 0, jobCampuses: 0, settings: 0 };

  const orgRow = await tx.organization.findUniqueOrThrow({ where: { id: org.id }, select: { settings: true } });
  const settings = JSON.parse(orgRow.settings ?? "{}");
  if (!settings.inventory || !settings.library) {
    const { categories, warehouses, units, users, school, lowStockAlerts, criticalPercent } = d.inventorySettings;
    settings.inventory ??= { categories, warehouses, units, users, school, lowStockAlerts, criticalPercent };
    settings.library ??= { finePerDay: 5, loanDays: 14 };
    await tx.organization.update({ where: { id: org.id }, data: { settings: JSON.stringify(settings) } });
    counts.settings = 1;
  }

  for (const j of d.jobs) {
    if (!j.campus) continue;
    counts.jobCampuses += (await tx.jobOpening.updateMany({ where: { organizationId: org.id, title: j.title, campus: null }, data: { campus: j.campus } })).count;
  }

  const students = await tx.student.findMany({ where: { organizationId: org.id, sensitive: null }, select: { id: true, admissionNo: true } });
  const byAdmission = new Map(d.students.map((s) => [s.admissionNo, s]));
  for (const s of students) {
    const aadhaar = String(byAdmission.get(s.admissionNo)?.aadharNo ?? "").replace(/\D/g, "");
    if (aadhaar.length !== 12) continue;
    await tx.student.update({ where: { id: s.id }, data: { sensitive: encryptJson({ aadhaar }), aadhaarLast4: aadhaar.slice(-4) } });
    counts.studentAadhaar++;
  }

  const byCode = new Map(d.teachers.map((t) => [t.empId, t]));
  const staff = await tx.staff.findMany({ where: { organizationId: org.id, OR: [{ sensitive: null }, { bankAccount: null }] }, select: { id: true, employeeCode: true, sensitive: true, bankAccount: true } });
  for (const s of staff) {
    const t = byCode.get(s.employeeCode);
    if (!t) continue;
    const data: Record<string, string> = {};
    const aadhaar = String(t.aadhar ?? "").replace(/\D/g, "");
    if (!s.sensitive && (aadhaar || t.pan)) { data.sensitive = encryptJson({ aadhaar: aadhaar || null, pan: orNull(t.pan) }); counts.staffSensitive++; }
    if (!s.bankAccount && t.accountNo) { data.bankAccount = encryptJson({ bankName: t.bankName, accountNo: t.accountNo, ifsc: t.ifscCode, branch: t.branchName, type: t.accountType }); counts.staffBank++; }
    if (Object.keys(data).length) await tx.staff.update({ where: { id: s.id }, data });
  }

  if (!(await tx.holiday.count({ where: { organizationId: org.id } }))) {
    const years = await tx.academicYear.findMany({ where: { organizationId: org.id }, select: { id: true, startDate: true, endDate: true } });
    const rows = d.holidays.flatMap((h) => {
      const start = mustDay(h.start);
      const year = years.find((y) => start >= y.startDate && start <= y.endDate);
      return year ? [{ organizationId: org.id, academicYearId: year.id, name: h.name, startDate: start, endDate: mustDay(h.end), type: upper(h.type) ?? "SCHOOL" }] : [];
    });
    if (rows.length) await tx.holiday.createMany({ data: rows });
    counts.holidays = rows.length;
  }

  if (!(await tx.gradingScale.count({ where: { organizationId: org.id } }))) {
    await tx.gradingScale.create({ data: { organizationId: org.id, name: "CBSE 9-point", bands: JSON.stringify(CBSE_BANDS), isDefault: true } });
    counts.gradingScales = 1;
  }
  return counts;
}

async function main() {
  const exists = await withSystem((tx) => tx.organization.findUnique({ where: { subdomain: ORG_SUBDOMAIN }, select: { id: true } }));
  const data = await loadFrontend();
  if (exists) {
    console.log(`Organization "${ORG_SUBDOMAIN}" already exists — only filling in missing details.`);
  } else {
    const started = Date.now();
    const counts = await withSystem((tx) => importAll(tx, data), { timeout: 300_000 });
    console.log(`Imported the frontend demo data as organization "${ORG_SUBDOMAIN}" in ${((Date.now() - started) / 1000).toFixed(1)}s:`);
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(22)} ${v}`);
  }
  const extra = await withSystem((tx) => enrich(tx, data), { timeout: 120_000 });
  for (const [k, v] of Object.entries(extra)) console.log(`  ${k.padEnd(22)} ${v}`);
  console.log(`\nSign in with organization "${ORG_SUBDOMAIN}" and password ${DEMO_PASSWORD}: admin, principal, accountant, hr…, teachers T001–T006, students by admission no. (e.g. ADM-2025-1001), parents by phone (e.g. 9876511111).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
