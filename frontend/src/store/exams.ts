/**
 * Exams and their paper schedule, from the API (GET /exams). Pages keep the old shape
 * (numeric id, grade numbers, papers with subject name / date / "09:30 AM – 12:30 PM").
 */
import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { SUBJECTS } from "@/data/academics";
import { daysFromToday } from "@/lib/dates";
import { mutate, remoteStore, tempId } from "./remote";
import { parseTimeRange, requireSubject, subjectStore, to12h } from "./timetable";

export interface ExamPaper {
  subject: string;
  /** YYYY-MM-DD */
  date: string;
  time: string;
}

export interface Exam {
  id: number;
  /** e.g. "Mid Term" */
  name: string;
  /** Grades sitting the exam */
  grades: number[];
  papers: ExamPaper[];
  /** Students can see their marks only once results are published. */
  resultsPublished: boolean;
}

interface ApiExam {
  id: string; name: string; gradeNames: string[]; resultsPublished: boolean;
  papers: { id: string; subjectId: string; subjectName: string; date: string; startTime: string; endTime: string; maxMarks: number; passMarks: number }[];
}

/** One paper every other weekday, starting `startInDays` from today. */
export function paperSchedule(startInDays: number, subjects = SUBJECTS, time = "09:30 AM – 12:30 PM"): ExamPaper[] {
  const papers: ExamPaper[] = [];
  let offset = startInDays;
  for (const subject of subjects) {
    let date = daysFromToday(offset);
    while (new Date(`${date}T00:00:00`).getDay() === 0) date = daysFromToday(++offset);
    papers.push({ subject, date, time });
    offset += 2;
  }
  return papers;
}

const gradeNo = (name: string) => Number(name.replace(/\D+/g, " ").trim().split(" ")[0]) || 0;

const toExam = (e: ApiExam): Exam => ({
  id: numId("exam", e.id),
  name: e.name,
  grades: e.gradeNames.map(gradeNo).filter(Boolean),
  papers: e.papers.map((p) => ({ subject: p.subjectName, date: p.date, time: `${to12h(p.startTime)} – ${to12h(p.endTime)}` })),
  resultsPublished: e.resultsPublished,
});

/** Max marks per exam + subject, for pages that need them (e.g. report cards). */
export const paperMaxMarks = new Map<string, number>();

export const examStore = remoteStore<Exam[]>("exams", [], async () => {
  await subjectStore.load();
  const rows = await api.get<ApiExam[]>("/exams");
  paperMaxMarks.clear();
  for (const e of rows) for (const p of e.papers) paperMaxMarks.set(`${e.name}|${p.subjectName}`, p.maxMarks);
  return rows.map(toExam);
});
export const useExams = () => examStore.useValue();

const toApiPapers = (papers: ExamPaper[]) =>
  papers.map((p) => {
    const [startTime, endTime] = parseTimeRange(p.time);
    return { subjectId: requireSubject(p.subject), date: p.date, startTime, endTime };
  });

/** GUID of an exam by its name (marks are entered against exam names). */
export const examGuidByName = (name: string) => {
  const e = examStore.get().find((x) => x.name === name && x.id > 0);
  return e ? guidOf("exam", e.id) : undefined;
};

export function updateExam(id: number, patch: Partial<Exam>) {
  void mutate(examStore, (list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)), () =>
    api.patch(`/exams/${guidOf("exam", id)}`, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.grades !== undefined ? { gradeNames: patch.grades.map((g) => `Class ${g}`) } : {}),
      ...(patch.papers !== undefined ? { papers: toApiPapers(patch.papers) } : {}),
      ...(patch.resultsPublished !== undefined ? { resultsPublished: patch.resultsPublished } : {}),
    }),
  );
}

export function addExam(e: Omit<Exam, "id">) {
  const id = tempId();
  void mutate(examStore, (list) => [...list, { ...e, id }], async () => {
    const created = await api.post<ApiExam>("/exams", { name: e.name, gradeNames: e.grades.map((g) => `Class ${g}`), papers: toApiPapers(e.papers), resultsPublished: e.resultsPublished });
    examStore.set((list) => list.map((x) => (x.id === id ? toExam(created) : x)));
  });
}

export function removeExam(id: number) {
  void mutate(examStore, (list) => list.filter((e) => e.id !== id), () => api.del(`/exams/${guidOf("exam", id)}`));
}

export const examStatus = (e: Exam): "Upcoming" | "Ongoing" | "Completed" => {
  const today = daysFromToday(0);
  const first = e.papers[0]?.date ?? today, last = e.papers.at(-1)?.date ?? today;
  return today < first ? "Upcoming" : today > last ? "Completed" : "Ongoing";
};

/** Names of exams whose results students may see. */
export const usePublishedExamNames = () => new Set(useExams().filter((e) => e.resultsPublished).map((e) => e.name));

/** Next exam (not yet finished) that a grade sits. */
export function nextExamFor(exams: Exam[], grade: number): Exam | undefined {
  return exams
    .filter((e) => e.grades.includes(grade) && examStatus(e) !== "Completed")
    .sort((a, b) => (a.papers[0]?.date ?? "").localeCompare(b.papers[0]?.date ?? ""))[0];
}
