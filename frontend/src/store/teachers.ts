/**
 * Teachers = staff with staffType TEACHING, from the API (GET /staff). Fields without a column of
 * their own (qualifications, family, documents…) travel in `profile`; Aadhaar / PAN and bank details
 * are only sent to people allowed to see them (staff.write) and are stored encrypted.
 */
import { toast } from "sonner";
import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import type { EmploymentType, Teacher, TeacherStatus } from "@/types/teacher";
import { connectTeacherNames } from "./classes";
import { mutate, remoteCollection, tempId } from "./remote";

interface ApiStaff {
  id: string;
  employeeCode: string;
  name: string;
  gender: string | null;
  dob?: string | null;
  phone?: string | null;
  email?: string | null;
  designation: string;
  department: string | null;
  employmentType?: string | null;
  joiningDate?: string | null;
  status: string;
  basicSalary?: number | null;
  allowances?: { hra?: number; da?: number; ta?: number; other?: number } | null;
  profile: Record<string, unknown>;
  sensitive?: { aadhaar?: string | null; pan?: string | null } | null;
  bank?: { bankName?: string; accountNo?: string; ifsc?: string; branch?: string; type?: string } | null;
}

const EMPLOYMENT: Record<string, EmploymentType> = { PERMANENT: "Permanent", PROBATION: "Probation", CONTRACT: "Contract", PART_TIME: "Part-Time", GUEST: "Guest Faculty" };
const STATUS: Record<string, TeacherStatus> = { ACTIVE: "Active", ON_LEAVE: "On Leave", SUSPENDED: "Suspended", RESIGNED: "Resigned" };
const toUpperKey = (v: string) => v.trim().toUpperCase().replace(/[\s-]+/g, "_");
const title = (v: string | null | undefined) => (v ? v.charAt(0) + v.slice(1).toLowerCase() : "");
const initials = (name: string) => name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/, "").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const str = (v: unknown) => (v == null ? "" : String(v));
const fmtAadhaar = (d: string) => d.replace(/(\d{4})(?=\d)/g, "$1 ");

/** Teacher fields kept in their own columns (everything else goes into `profile`). */
const COLUMN_KEYS = new Set(["id", "empId", "name", "gender", "dob", "phone", "email", "designation", "department", "employmentType", "joiningDate", "status", "basicSalary", "hra", "da", "ta", "otherAllowances", "aadhar", "pan", "bankName", "accountNo", "ifscCode", "branchName", "accountType", "initials"]);

function toTeacher(s: ApiStaff): Teacher {
  const p = s.profile ?? {};
  const base = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v])) as Partial<Teacher>;
  return {
    // defaults for anything missing from older records
    alternatePhone: "", personalEmail: "", address: "", city: "", state: "", pincode: "", permanentAddress: "", permanentCity: "", permanentState: "", permanentPincode: "",
    bloodGroup: "", nationality: "Indian", religion: "", category: "", maritalStatus: "", fatherName: "", fatherOccupation: "", fatherPhone: "", motherName: "", motherOccupation: "",
    spouseName: "", spouseOccupation: "", spousePhone: "", children: "", emergencyContact: "", emergencyRelation: "", emergencyPhone: "", positions: [], classTeacherOf: "", classSubjects: [],
    experience: "", reportingTo: "", academicYear: "", medium: "", highestQualification: "", qualifications: [], bEd: false, bEdInstitute: "", bEdYear: "", bEdPercent: "", tet: false, tetLevel: "",
    tetScore: "", tetYear: "", ctet: false, ctetPaper: "", ctetScore: "", ctetYear: "", otherCerts: "", totalExperience: "", experiences: [], salaryGrade: "", pfNo: "", esiNo: "", gpfNo: "",
    height: "", weight: "", bloodGroupHealth: "", medicalCondition: "", allergies: "", specialNeeds: "", doctorName: "", doctorPhone: "", physicallyHandicapped: false, handicapType: "",
    handicapPercent: "", docAadhar: false, docPan: false, docDegree: false, docBEd: false, docTET: false, docExperience: false, docCaste: false, docResidence: false, docPassport: false,
    docMedical: false, docPoliceVerification: false,
    ...base,
    id: numId("staff", s.id),
    empId: s.employeeCode,
    name: s.name,
    gender: title(s.gender),
    dob: s.dob ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    designation: s.designation,
    department: s.department ?? "",
    employmentType: EMPLOYMENT[s.employmentType ?? ""] ?? "Permanent",
    joiningDate: s.joiningDate ?? "",
    status: STATUS[s.status] ?? "Active",
    basicSalary: str(s.basicSalary),
    hra: str(s.allowances?.hra), da: str(s.allowances?.da), ta: str(s.allowances?.ta), otherAllowances: str(s.allowances?.other),
    aadhar: s.sensitive?.aadhaar ? fmtAadhaar(s.sensitive.aadhaar) : "",
    pan: s.sensitive?.pan ?? "",
    bankName: s.bank?.bankName ?? "", accountNo: s.bank?.accountNo ?? "", ifscCode: s.bank?.ifsc ?? "", branchName: s.bank?.branch ?? "", accountType: s.bank?.type ?? "",
    initials: (base.initials as string) || initials(s.name),
  } as Teacher;
}

const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

function toApi(t: Omit<Teacher, "id">) {
  const profile = Object.fromEntries(Object.entries(t).filter(([k]) => !COLUMN_KEYS.has(k)));
  const aadhaar = t.aadhar.replace(/\D/g, "");
  return {
    employeeCode: t.empId,
    name: t.name.trim(),
    gender: t.gender ? toUpperKey(t.gender) : null,
    dob: t.dob || null,
    phone: t.phone || null,
    email: t.email || "",
    staffType: "TEACHING",
    designation: t.designation || "Teacher",
    department: t.department || null,
    employmentType: t.employmentType ? toUpperKey(t.employmentType).replace("GUEST_FACULTY", "GUEST") : null,
    joiningDate: t.joiningDate || null,
    status: toUpperKey(t.status || "Active"),
    basicSalary: num(t.basicSalary),
    allowances: { hra: num(t.hra), da: num(t.da), ta: num(t.ta), other: num(t.otherAllowances) },
    profile: { ...profile, initials: t.initials },
    ...(aadhaar.length === 12 || t.pan ? { sensitive: { ...(aadhaar.length === 12 ? { aadhaar } : {}), ...(t.pan ? { pan: t.pan.toUpperCase() } : {}) } } : {}),
    ...(t.accountNo || t.bankName ? { bank: { bankName: t.bankName, accountNo: t.accountNo, ifsc: t.ifscCode, branch: t.branchName, type: t.accountType } } : {}),
  };
}

const teacherBase = remoteCollection<Teacher>("teachers", async () => {
  const rows = await api.get<ApiStaff[]>("/staff?type=TEACHING");
  return rows.map(toTeacher);
});

export const teacherStore = Object.assign(teacherBase, {
  add(record: Omit<Teacher, "id">): Teacher {
    const id = tempId();
    const created = { ...record, id } as Teacher;
    void mutate(teacherBase, (l) => [...l, created], async () => {
      const res = await api.post<ApiStaff & { temporaryPassword?: string }>("/staff", { ...toApi(record), createLogin: true });
      teacherBase.set((l) => l.map((x) => (x.id === id ? toTeacher(res) : x)));
      if (res.temporaryPassword) toast.success(`${record.name} can sign in as ${record.empId} with the temporary password ${res.temporaryPassword}`, { duration: 20000 });
    });
    return created;
  },
  update(record: Teacher) {
    void mutate(teacherBase, (l) => l.map((x) => (x.id === record.id ? record : x)), () => api.patch(`/staff/${guidOf("staff", record.id)}`, toApi(record)));
  },
  /** Teachers are never deleted — they are marked as resigned and their sign-in is switched off. */
  remove(id: number) {
    void mutate(teacherBase, (l) => l.filter((x) => x.id !== id), () => api.patch(`/staff/${guidOf("staff", id)}`, { status: "RESIGNED" }));
  },
});

connectTeacherNames(
  (guid) => teacherBase.getAll().find((t) => maybeGuid("staff", t.id) === guid.toLowerCase())?.name ?? "",
  (name) => {
    const t = teacherBase.getAll().find((x) => x.name === name);
    return t ? maybeGuid("staff", t.id) ?? null : null;
  },
);

/** Shared teacher list + actions. Changes are visible on every page. */
export function useTeachers() {
  return {
    teachers: teacherBase.useItems(),
    addTeacher: teacherStore.add,
    updateTeacher: teacherStore.update,
    removeTeacher: teacherStore.remove,
  };
}

/** Next employee id in the T001, T002 … series. */
export function nextEmpId() {
  const max = teacherBase.getAll().reduce((m, t) => Math.max(m, Number(t.empId.replace(/\D/g, "")) || 0), 0);
  return `T${String(max + 1).padStart(3, "0")}`;
}
