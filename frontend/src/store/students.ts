/**
 * Students, from the API. Staff with students.read get the branch's whole roster (GET /students/full);
 * a student or parent gets only their own / their children's records. The page-facing shape
 * (the `Student` type, numeric ids, "Class 10-A") is unchanged.
 */
import { useMemo } from "react";
import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { sortClassNames } from "@/data/classes";
import type { Student } from "@/types/student";
import { authStore, can } from "./auth";
import { sectionGuid, sectionName, sectionStore } from "./classes";
import { mutate, remoteCollection, tempId } from "./remote";

export { createStudent, getInitials } from "@/data/studentFactory";

interface ApiGuardian { id: string; name: string; phone: string; email: string | null; occupation: string | null; annualIncome: string | null; relation: string; isPrimary: boolean }
interface ApiStudent {
  id: string; admissionNo: string; firstName: string; middleName: string | null; lastName: string | null; gender: string | null; dob: string | null; bloodGroup: string | null;
  category: string | null; religion: string | null; aadhaarLast4: string | null; admissionDate: string | null; status: string; academicYear: string;
  address: { present?: Record<string, string>; permanent?: Record<string, string> } | null; health: Record<string, string> | null;
  previousSchool: Record<string, string> | null; profile: Record<string, unknown> | null; attendancePercent?: number | null;
  class: { grade: string; section: string; rollNo: string; sectionId: string } | null;
  guardians: ApiGuardian[];
}

const CATEGORY: Record<string, string> = { GENERAL: "General", OBC: "OBC", SC: "SC", ST: "ST", EWS: "EWS" };
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const title = (v: string | null | undefined) => (v ? v.charAt(0) + v.slice(1).toLowerCase() : "");
const s = (v: unknown) => (v == null ? "" : String(v));
const b = (v: unknown) => v === true;
const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
const MASKED = /^X{4} X{4} \d{4}$/;

function toStudent(r: ApiStudent): Student {
  const p = r.profile ?? {};
  const present = r.address?.present ?? {};
  const permanent = r.address?.permanent ?? {};
  const h = r.health ?? {};
  const prev = r.previousSchool ?? {};
  const father = r.guardians.find((g) => g.relation === "FATHER");
  const mother = r.guardians.find((g) => g.relation === "MOTHER");
  const name = [r.firstName, r.middleName, r.lastName].filter(Boolean).join(" ");
  return {
    id: numId("student", r.id),
    rollNo: r.class?.rollNo ?? "",
    name,
    class: r.class ? `${r.class.grade}-${r.class.section}` : "",
    email: s(p.email), phone: s(p.phone),
    attendance: r.attendancePercent ?? Number(p.attendance ?? 0), performance: (p.performance as Student["performance"]) ?? "Average",
    initials: initialsOf(name),
    firstName: r.firstName, middleName: r.middleName ?? "", lastName: r.lastName ?? "",
    dob: r.dob ?? "", gender: title(r.gender), bloodGroup: r.bloodGroup ?? "", nationality: s(p.nationality) || "Indian", religion: r.religion ?? "", category: CATEGORY[r.category ?? ""] ?? "",
    admissionClass: s(p.admissionClass), admissionSection: s(p.admissionSection), admissionDate: r.admissionDate ?? "", admissionNo: r.admissionNo, academicYear: r.academicYear, medium: s(p.medium),
    presentAddress: s(present.line), presentCity: s(present.city), presentState: s(present.state), presentPincode: s(present.pincode),
    permanentAddress: s(permanent.line), permanentCity: s(permanent.city), permanentState: s(permanent.state), permanentPincode: s(permanent.pincode),
    aadharNo: r.aadhaarLast4 ? `XXXX XXXX ${r.aadhaarLast4}` : "", birthCertNo: s(p.birthCertNo),
    prevSchoolName: s(prev.name), prevSchoolBoard: s(prev.board), prevClass: s(prev.class), prevPercentage: s(prev.percentage), tcNo: s(prev.tcNo),
    fatherName: father?.name ?? "", fatherOccupation: father?.occupation ?? "", fatherPhone: father?.phone ?? "", fatherEmail: father?.email ?? "", fatherAnnualIncome: father?.annualIncome ?? "",
    motherName: mother?.name ?? "", motherOccupation: mother?.occupation ?? "", motherPhone: mother?.phone ?? "", motherEmail: mother?.email ?? "",
    height: s(h.height), weight: s(h.weight), bloodGroupHealth: s(h.bloodGroupHealth), medicalCondition: s(h.medicalCondition), allergies: s(h.allergies), doctorName: s(h.doctorName), doctorPhone: s(h.doctorPhone),
    needsTransport: b(p.needsTransport), busRoute: s(p.busRoute), busStop: s(p.busStop), pickupAddress: s(p.pickupAddress),
    sports: Array.isArray(p.sports) ? (p.sports as string[]) : [], arts: Array.isArray(p.arts) ? (p.arts as string[]) : [], otherActivities: s(p.otherActivities),
    feeCategory: s(p.feeCategory) || "Regular", concessionType: s(p.concessionType) || "None", concessionPercent: s(p.concessionPercent), feeRecords: [],
    docBirthCert: b(p.docBirthCert), docAadhar: b(p.docAadhar), docTC: b(p.docTC), docMarksheet: b(p.docMarksheet), docPhotos: b(p.docPhotos), docCasteCert: b(p.docCasteCert),
  };
}

const PROFILE_KEYS = ["email", "phone", "attendance", "performance", "nationality", "admissionClass", "admissionSection", "medium", "birthCertNo", "needsTransport", "busRoute", "busStop", "pickupAddress", "sports", "arts", "otherActivities", "feeCategory", "concessionType", "concessionPercent", "docBirthCert", "docAadhar", "docTC", "docMarksheet", "docPhotos", "docCasteCert"] as const;

function guardians(st: Omit<Student, "id">) {
  const list = [];
  if (st.fatherName.trim() && st.fatherPhone.trim()) list.push({ name: st.fatherName.trim(), phone: st.fatherPhone.trim(), relation: "FATHER", email: st.fatherEmail || null, occupation: st.fatherOccupation || null, annualIncome: st.fatherAnnualIncome || null, isPrimary: true });
  if (st.motherName.trim() && st.motherPhone.trim()) list.push({ name: st.motherName.trim(), phone: st.motherPhone.trim(), relation: "MOTHER", email: st.motherEmail || null, occupation: st.motherOccupation || null, isPrimary: list.length === 0 });
  return list;
}

/** Personal details in the API's shape (used by create and update). */
function personal(st: Omit<Student, "id">) {
  const aadhaar = st.aadharNo.replace(/\D/g, "");
  return {
    firstName: st.firstName.trim() || st.name.trim().split(" ")[0],
    middleName: st.middleName.trim() || null,
    lastName: st.lastName.trim() || null,
    gender: st.gender ? st.gender.toUpperCase() : null,
    dob: st.dob || null,
    bloodGroup: BLOOD.includes(st.bloodGroup) ? st.bloodGroup : null,
    category: st.category ? st.category.toUpperCase() : null,
    religion: st.religion || null,
    ...(!MASKED.test(st.aadharNo) && aadhaar.length === 12 ? { aadhaar } : {}),
    admissionDate: st.admissionDate || null,
    address: {
      present: { line: st.presentAddress, city: st.presentCity, state: st.presentState, pincode: st.presentPincode },
      permanent: { line: st.permanentAddress, city: st.permanentCity, state: st.permanentState, pincode: st.permanentPincode },
    },
    health: { height: st.height, weight: st.weight, bloodGroupHealth: st.bloodGroupHealth, medicalCondition: st.medicalCondition, allergies: st.allergies, doctorName: st.doctorName, doctorPhone: st.doctorPhone },
    previousSchool: st.prevSchoolName ? { name: st.prevSchoolName, board: st.prevSchoolBoard, class: st.prevClass, percentage: st.prevPercentage, tcNo: st.tcNo } : null,
    profile: Object.fromEntries(PROFILE_KEYS.map((k) => [k, st[k]])),
  };
}

const studentBase = remoteCollection<Student>("students", async () => {
  const { role, me } = authStore.get();
  if (role === "student" || role === "parent") {
    const rows = await Promise.all((me?.students ?? []).map((x) => api.get<ApiStudent>(`/students/${x.id}`)));
    return rows.map(toStudent);
  }
  if (!can("students.read")) return [];
  return (await api.get<ApiStudent[]>("/students/full")).map(toStudent);
});

export const studentStore = Object.assign(studentBase, {
  add(record: Omit<Student, "id">): Student {
    const id = tempId();
    const created = { ...record, id } as Student;
    void mutate(studentBase, (l) => [...l, created], async () => {
      const sectionId = sectionGuid(record.class);
      if (!sectionId) throw new Error(`Class ${record.class} does not exist — create the section first.`);
      const res = await api.post<ApiStudent>("/students", {
        ...personal(record), sectionId, admissionNo: /^[A-Za-z0-9/-]{1,30}$/.test(record.admissionNo) ? record.admissionNo : undefined,
        rollNo: /^[0-9A-Za-z]{1,10}$/.test(record.rollNo) ? record.rollNo : undefined, guardians: guardians(record),
      });
      studentBase.set((l) => l.map((x) => (x.id === id ? toStudent(res) : x)));
    });
    return created;
  },
  update(record: Student) {
    const before = studentBase.getAll().find((x) => x.id === record.id);
    void mutate(studentBase, (l) => l.map((x) => (x.id === record.id ? record : x)), async () => {
      const guid = guidOf("student", record.id);
      const moved = before && before.class !== record.class ? sectionGuid(record.class) : undefined;
      await api.patch(`/students/${guid}`, {
        ...personal(record),
        ...(moved ? { sectionId: moved } : {}),
        ...(before && before.rollNo !== record.rollNo && record.rollNo ? { rollNo: record.rollNo } : {}),
      });
      const g = guardians(record);
      const changed = !before || JSON.stringify(guardians(before)) !== JSON.stringify(g);
      if (changed && g.length) await api.put(`/students/${guid}/guardians`, { guardians: g });
    });
  },
  /** Students are not deleted: they are marked as left and disappear from the roster. */
  remove(id: number) {
    void mutate(studentBase, (l) => l.filter((x) => x.id !== id), () => api.patch(`/students/${guidOf("student", id)}`, { status: "LEFT" }));
  },
});

/** Shared student list + actions. Changes are visible on every page. */
export function useStudents() {
  return {
    students: studentBase.useItems(),
    addStudent: studentStore.add,
    updateStudent: studentStore.update,
    removeStudent: studentStore.remove,
  };
}

/** Groups students by class name, each class sorted by roll number. */
export function groupByClass(students: Student[]): Record<string, Student[]> {
  const byClass: Record<string, Student[]> = {};
  for (const st of students) (byClass[st.class] ??= []).push(st);
  for (const list of Object.values(byClass)) list.sort((a, c) => a.rollNo.localeCompare(c.rollNo, undefined, { numeric: true }));
  return byClass;
}

/**
 * Class-wise roster for pages that work class by class (marks, attendance, reports).
 * `classes` contains every configured class plus any class a student was admitted into.
 */
export function useClassRoster() {
  const students = studentBase.useItems();
  const sections = sectionStore.useItems();
  return useMemo(() => {
    const byClass = groupByClass(students);
    const classes = sortClassNames([...new Set([...sections.map(sectionName), ...Object.keys(byClass)])]);
    return { classes, byClass };
  }, [students, sections]);
}
