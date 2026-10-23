/**
 * Assignments, from the API (GET /assignments). Teachers create and grade, students submit,
 * the principal monitors. Students and parents receive only their own submissions.
 */
import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import { daysUntil, today } from "@/lib/dates";
import type { Assignment, AssignmentStatus, StudentAssignmentStatus } from "@/types/assignment";
import { mayRead } from "./auth";
import { sectionGuid, sectionName, sectionStore } from "./classes";
import { ifAllowed, mutate, remoteStore, tempId } from "./remote";
import { teacherStore } from "./teachers";
import { requireSubject } from "./timetable";

interface ApiAssignment {
  id: string; sectionId: string; subjectName: string; teacherName: string; title: string; description: string | null;
  assignedDate: string; dueDate: string; totalMarks: number;
  submissions: { studentId: string; submittedAt: string; fileName: string; marksObtained: number | null; feedback: string | null }[];
}

/** "Class 10-A" for a section GUID (pages identify classes by name). */
export function classNameOfSection(guid: string) {
  const s = sectionStore.get().find((x) => maybeGuid("section", x.id) === guid.toLowerCase());
  return s ? sectionName(s) : "";
}

/** Staff GUID of a teacher by name (the forms pick teachers by name). */
export function teacherGuidByName(name: string) {
  const t = teacherStore.getAll().find((x) => x.name === name);
  return t && t.id > 0 ? guidOf("staff", t.id) : undefined;
}

const toAssignment = (a: ApiAssignment): Assignment => ({
  id: numId("assignment", a.id),
  title: a.title,
  subject: a.subjectName,
  class: classNameOfSection(a.sectionId),
  description: a.description ?? "",
  teacher: a.teacherName,
  assignedDate: a.assignedDate,
  dueDate: a.dueDate,
  totalMarks: a.totalMarks,
  submissions: a.submissions.map((s) => ({
    studentId: numId("student", s.studentId),
    submittedAt: s.submittedAt,
    fileName: s.fileName,
    ...(s.marksObtained != null ? { marksObtained: s.marksObtained } : {}),
    ...(s.feedback ? { feedback: s.feedback } : {}),
  })),
});

export const assignmentStore = remoteStore<Assignment[]>("assignments", [], async () => {
  await Promise.all([sectionStore.load(), teacherStore.load()]);
  if (!mayRead("students.read")) return [];
  return (await ifAllowed(api.get<ApiAssignment[]>("/assignments"), [])).map(toAssignment);
});

/** Shared assignments: teachers create and grade, students submit, the principal monitors. */
export function useAssignments() {
  return assignmentStore.useValue();
}

export function addAssignment(a: Omit<Assignment, "id" | "submissions" | "assignedDate">): Assignment {
  const id = tempId();
  const created: Assignment = { ...a, id, assignedDate: today(), submissions: [] };
  void mutate(assignmentStore, (list) => [created, ...list], async () => {
    const sectionId = sectionGuid(a.class);
    if (!sectionId) throw new Error(`Class ${a.class} is not set up.`);
    const res = await api.post<{ id: string }>("/assignments", {
      sectionId, subjectId: requireSubject(a.subject), teacherId: teacherGuidByName(a.teacher),
      title: a.title, description: a.description || null, assignedDate: created.assignedDate, dueDate: a.dueDate, totalMarks: Number(a.totalMarks) || 0,
    });
    assignmentStore.set((list) => list.map((x) => (x.id === id ? { ...x, id: numId("assignment", res.id) } : x)));
  });
  return created;
}

export function removeAssignment(id: number) {
  void mutate(assignmentStore, (list) => list.filter((a) => a.id !== id), () => api.del(`/assignments/${guidOf("assignment", id)}`));
}

/** Records (or replaces) a student's submission. The file itself is not uploaded yet — only its name. */
export function submitAssignment(id: number, studentId: number, fileName: string, file?: File) {
  void mutate(
    assignmentStore,
    (list) => list.map((a) => a.id !== id ? a : {
      ...a,
      submissions: [...a.submissions.filter((s) => s.studentId !== studentId), { studentId, submittedAt: today(), fileName }],
    }),
    () => api.post(`/assignments/${guidOf("assignment", id)}/submissions`, {
      studentId: guidOf("student", studentId), fileName, sizeBytes: file?.size ?? 0, mimeType: file?.type || "application/octet-stream",
    }),
  );
}

export function gradeSubmission(id: number, studentId: number, marksObtained: number, feedback: string) {
  void mutate(
    assignmentStore,
    (list) => list.map((a) => a.id !== id ? a : {
      ...a,
      submissions: a.submissions.map((s) => s.studentId === studentId ? { ...s, marksObtained, feedback } : s),
    }),
    () => api.patch(`/assignments/${guidOf("assignment", id)}/submissions/${guidOf("student", studentId)}`, { marksObtained, feedback: feedback || null }),
  );
}

export function assignmentStatus(a: Assignment): AssignmentStatus {
  if (daysUntil(a.assignedDate) > 0) return "upcoming";
  return daysUntil(a.dueDate) < 0 ? "closed" : "active";
}

export function studentAssignmentStatus(a: Assignment, studentId: number): StudentAssignmentStatus {
  const sub = a.submissions.find((s) => s.studentId === studentId);
  if (sub) return sub.marksObtained !== undefined ? "graded" : "submitted";
  return daysUntil(a.dueDate) < 0 ? "overdue" : "pending";
}

export function isOnTime(a: Assignment, studentId: number): boolean {
  const sub = a.submissions.find((s) => s.studentId === studentId);
  return !!sub && sub.submittedAt <= a.dueDate;
}
