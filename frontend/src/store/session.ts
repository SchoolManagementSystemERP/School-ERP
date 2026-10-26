/**
 * The signed-in user, as the pages see it. Sign-in itself lives in ./auth (API session);
 * this file keeps the helpers pages already use (current student / teacher, subjects, classes).
 */
import { SUBJECTS } from "@/data/academics";
import type { Student } from "@/types/student";
import type { Teacher } from "@/types/teacher";
import { guidOf } from "@/api/ids";
import { authStore } from "./auth";
import { studentStore } from "./students";
import { teacherStore } from "./teachers";
import { timetableStore } from "./timetable";

export { ROLE_ACCOUNTS, currentRole, signIn, signOut, ensureSession, changePassword, switchBranch, can, authStore, lastOrganization, LOGIN_PATH, LOGIN_LEVEL_LABEL, lastLoginPath } from "./auth";
export type { Role, LoginLevel } from "./auth";

/** Kept for older call sites: 0 means "the first one in the list". */
export const DEFAULT_STUDENT_ID = 0;
export const DEFAULT_TEACHER_ID = 0;

/** Signs out (API) and goes back to the sign-in page. */
export { signOut as logout } from "./auth";

/** Parents with several children switch between them. */
export function setCurrentStudentId(studentId: number) {
  authStore.set({ studentId });
}

export function setCurrentTeacherId(teacherId: number) {
  authStore.set({ teacherId });
}

/** Finds a student by roll number or admission number (case-insensitive). */
export function findStudentByLogin(id: string): Student | undefined {
  const q = id.trim().toLowerCase();
  if (!q) return undefined;
  return studentStore.getAll().find((s) => s.rollNo.toLowerCase() === q || s.admissionNo.toLowerCase() === q);
}

/** Finds a teacher by employee id (case-insensitive). */
export function findTeacherByLogin(id: string): Teacher | undefined {
  const q = id.trim().toLowerCase();
  if (!q) return undefined;
  return teacherStore.getAll().find((t) => t.empId.toLowerCase() === q);
}

/** The signed-in student (or the parent's selected child). */
export function useCurrentStudent(): Student | undefined {
  const { studentId } = authStore.useValue();
  const students = studentStore.useItems();
  return students.find((s) => s.id === studentId) ?? students[0];
}

/** The signed-in teacher. */
export function useCurrentTeacher(): Teacher | undefined {
  const { teacherId } = authStore.useValue();
  const teachers = teacherStore.useItems();
  return teachers.find((t) => t.id === teacherId) ?? teachers[0];
}

/** The teacher's periods in the school timetable (matched by employee code). */
const timetableOf = (teacher: Teacher) => timetableStore.get().filter((p) => p.teacherCode === teacher.empId);

/** Subjects a teacher teaches (timetable + their class-subject allocation), falling back to their department. */
export function teacherSubjects(teacher: Teacher | undefined): string[] {
  if (!teacher) return [];
  const taught = [...new Set([...timetableOf(teacher).map((p) => p.subjectName), ...teacher.classSubjects.flatMap((c) => c.subjects)])];
  if (taught.length) return taught;
  return SUBJECTS.includes(teacher.department) ? [teacher.department] : [];
}

/** Classes a teacher teaches: sections they have periods in, plus every class whose grade is in their allocation. */
export function teacherClasses(teacher: Teacher | undefined, allClasses: string[]): string[] {
  if (!teacher) return [];
  const grades = new Set(teacher.classSubjects.map((c) => parseInt(c.className, 10)).filter(Boolean));
  const sections = new Set(timetableOf(teacher).map((p) => `${p.grade}-${p.section}`));
  return allClasses.filter((c) => sections.has(c) || grades.has(parseInt(c.replace(/^Class\s+/, ""), 10)));
}

/** GUID of the signed-in teacher (staff), for API calls. */
export const currentTeacherGuid = () => {
  const id = authStore.get().teacherId;
  return id ? guidOf("staff", id) : undefined;
};
