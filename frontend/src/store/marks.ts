/**
 * Exam marks, from the API (GET /marks). Pages keep the old shape:
 * marks[class][exam][subject][studentId] = mark as entered ("" = not entered, "AB" = absent).
 * Students and parents receive only published results.
 */
import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { examGuidByName, examStore } from "./exams";
import { authStore, mayRead } from "./auth";
import { ifAllowed, mutate, remoteStore } from "./remote";
import { studentStore } from "./students";
import { requireSubject, subjectNameOf, subjectStore } from "./timetable";

/** marks[class][exam][subject][studentId] = mark as entered (string, "" = not entered) */
export type MarksStore = Record<string, Record<string, Record<string, Record<number, string>>>>;

interface ApiRank { studentId: string; examId: string; subjectId: string | null; rank: number; outOf: number }

/** Class ranks for students and parents (they do not receive classmates' marks). Key: class|exam|subject|student. */
const ranks = new Map<string, { rank: number; outOf: number }>();
export const classRankOf = (cls: string, exam: string, studentId: number, subject = "") => ranks.get(`${cls}|${exam}|${subject}|${studentId}`);

interface ApiMark { examId: string; subjectId: string; studentId: string; marks: number | null; isAbsent: boolean }

export const marksStore = remoteStore<MarksStore>("marks", {}, async () => {
  await Promise.all([examStore.load(), studentStore.load(), subjectStore.load()]);
  const rows = mayRead("marks.read") ? await ifAllowed(api.get<ApiMark[]>("/marks"), []) : [];
  const examName = new Map(examStore.get().map((e) => [guidOf("exam", e.id), e.name]));
  const classOf = new Map(studentStore.getAll().map((s) => [s.id, s.class]));
  const data: MarksStore = {};
  for (const m of rows) {
    const sid = numId("student", m.studentId);
    const cls = classOf.get(sid);
    const exam = examName.get(m.examId.toLowerCase());
    const subj = subjectNameOf(m.subjectId);
    if (!cls || !exam || !subj) continue;
    (((data[cls] ??= {})[exam] ??= {})[subj] ??= {})[sid] = m.isAbsent ? "AB" : m.marks == null ? "" : String(m.marks);
  }
  ranks.clear();
  const { role } = authStore.get();
  if (role === "student" || role === "parent") {
    for (const r of await api.get<ApiRank[]>("/marks/ranks")) {
      const sid = numId("student", r.studentId);
      const cls = classOf.get(sid);
      const exam = examName.get(r.examId.toLowerCase());
      if (cls && exam) ranks.set(`${cls}|${exam}|${r.subjectId ? subjectNameOf(r.subjectId) : ""}|${sid}`, { rank: r.rank, outOf: r.outOf });
    }
  }
  return data;
});

const pending = new Map<string, { cls: string; exam: string; subj: string; marks: Record<number, string>; timer: ReturnType<typeof setTimeout> }>();

/**
 * Sets one student's mark (pages call this on every keystroke): shown at once, and saved
 * together with the other changes to the same class / exam / subject after a short pause.
 */
export function setMark(cls: string, exam: string, subj: string, studentId: number, value: string) {
  marksStore.set((prev) => ({
    ...prev,
    [cls]: { ...prev[cls], [exam]: { ...prev[cls]?.[exam], [subj]: { ...prev[cls]?.[exam]?.[subj], [studentId]: value } } },
  }));
  const key = `${cls}|${exam}|${subj}`;
  const p = pending.get(key) ?? { cls, exam, subj, marks: {}, timer: undefined as unknown as ReturnType<typeof setTimeout> };
  clearTimeout(p.timer);
  p.marks[studentId] = value;
  p.timer = setTimeout(() => {
    pending.delete(key);
    setSubjectMarks(p.cls, p.exam, p.subj, p.marks);
  }, 800);
  pending.set(key, p);
}

const ABSENT = /^a(b|bs|bsent)?$/i;

/** Merges several students' marks for a class / exam / subject and saves them. */
export function setSubjectMarks(cls: string, exam: string, subj: string, marks: Record<number, string>) {
  void mutate(
    marksStore,
    (prev) => ({
      ...prev,
      [cls]: { ...prev[cls], [exam]: { ...prev[cls]?.[exam], [subj]: { ...prev[cls]?.[exam]?.[subj], ...marks } } },
    }),
    () => {
      const examId = examGuidByName(exam);
      if (!examId) throw new Error(`Exam “${exam}” is not set up — add it in the exam schedule first.`);
      const entries = Object.entries(marks).map(([id, v]) => {
        const value = v.trim();
        const absent = ABSENT.test(value);
        const n = Number(value);
        if (!absent && value !== "" && Number.isNaN(n)) throw new Error(`“${value}” is not a valid mark.`);
        return { studentId: guidOf("student", Number(id)), marks: absent || value === "" ? null : n, isAbsent: absent };
      });
      return api.put("/marks", { examId, subjectId: requireSubject(subj), entries });
    },
  );
}

/** Shared marks for every class. Teacher and principal pages read and write the same data. */
export function useMarks() {
  return marksStore.useValue();
}
