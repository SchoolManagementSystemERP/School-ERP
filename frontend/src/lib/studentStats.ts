import { EXAM_TYPES, MAX_MARKS, SUBJECTS } from "@/data/academics";
import { gradeFor } from "@/lib/grades";
import { examStore, paperMaxMarks } from "@/store/exams";
import { classRankOf, type MarksStore } from "@/store/marks";
import type { AttendanceStatus, DayAttendanceRecord } from "@/types/attendance";

// ── Marks ─────────────────────────────────────────────────────────────────────

export interface SubjectResult {
  subject: string;
  marks: number;
  percentage: number;
  grade: string;
}

export interface ExamResult {
  exam: string;
  subjects: SubjectResult[];
  total: number;
  maxTotal: number;
  percentage: number;
  grade: string;
}

/** A student's result for one exam, or null if no marks have been entered yet. */
export function examResult(marks: MarksStore, cls: string, exam: string, studentId: number): ExamResult | null {
  const subjects: (SubjectResult & { max: number })[] = [];
  // the usual subjects first, then any other subject the exam has marks for
  const entered = Object.keys(marks[cls]?.[exam] ?? {});
  for (const subject of [...SUBJECTS.filter((x) => entered.includes(x)), ...entered.filter((x) => !SUBJECTS.includes(x))]) {
    const raw = marks[cls]?.[exam]?.[subject]?.[studentId];
    if (raw === undefined || raw === "") continue;
    const m = parseFloat(raw) || 0;
    const max = paperMaxMarks.get(`${exam}|${subject}`) ?? MAX_MARKS;
    const percentage = (m / max) * 100;
    subjects.push({ subject, marks: m, percentage, grade: gradeFor(percentage), max });
  }
  if (!subjects.length) return null;
  const total = subjects.reduce((a, s) => a + s.marks, 0);
  const maxTotal = subjects.reduce((a, s) => a + s.max, 0);
  const percentage = (total / maxTotal) * 100;
  return { exam, subjects, total, maxTotal, percentage, grade: gradeFor(percentage) };
}

/** Results for every exam that has marks, in exam order. */
export function examHistory(marks: MarksStore, cls: string, studentId: number): ExamResult[] {
  // exams in schedule order (falling back to the standard names before the schedule has loaded)
  const names = examStore.get().length ? examStore.get().map((e) => e.name) : EXAM_TYPES;
  return names.map((exam) => examResult(marks, cls, exam, studentId)).filter((r): r is ExamResult => r !== null);
}

/** 1-based rank by total marks among classmates; ties share a rank. */
export function rankInClass(
  marks: MarksStore, cls: string, exam: string, classmateIds: number[], studentId: number, subject?: string,
): { rank: number; outOf: number } | null {
  const score = (id: number) => {
    if (subject) {
      const raw = marks[cls]?.[exam]?.[subject]?.[id];
      return raw === undefined || raw === "" ? null : parseFloat(raw) || 0;
    }
    return examResult(marks, cls, exam, id)?.total ?? null;
  };
  const mine = score(studentId);
  if (mine === null) return null;
  const scores = classmateIds.map(score).filter((s): s is number => s !== null);
  // students and parents do not receive classmates' marks: the server works out their rank
  if (scores.length <= 1) return classRankOf(cls, exam, studentId, subject) ?? { rank: 1, outOf: scores.length };
  return { rank: scores.filter((s) => s > mine).length + 1, outOf: scores.length };
}

// ── Attendance ────────────────────────────────────────────────────────────────

export interface SubjectAttendance {
  subject: string;
  present: number;
  absent: number;
  leave: number;
  total: number;
  percentage: number;
}

/** Period-wise attendance of one student, grouped by subject. */
export function subjectAttendance(records: DayAttendanceRecord[], className: string, studentId: number): SubjectAttendance[] {
  const id = String(studentId);
  const bySubject = new Map<string, SubjectAttendance>();
  for (const rec of records) {
    if (rec.className !== className) continue;
    for (const p of rec.periods) {
      const entry = p.entries.find((e) => e.studentId === id);
      if (!entry) continue;
      const row = bySubject.get(p.subjectName) ?? { subject: p.subjectName, present: 0, absent: 0, leave: 0, total: 0, percentage: 0 };
      row.total++;
      row[entry.status]++;
      bySubject.set(p.subjectName, row);
    }
  }
  return [...bySubject.values()].map((r) => ({ ...r, percentage: r.total ? (r.present / r.total) * 100 : 0 }));
}

/** Totals across subjects. */
export function attendanceTotals(rows: SubjectAttendance[]) {
  const t = rows.reduce(
    (a, r) => ({ present: a.present + r.present, absent: a.absent + r.absent, leave: a.leave + r.leave, total: a.total + r.total }),
    { present: 0, absent: 0, leave: 0, total: 0 },
  );
  return { ...t, percentage: t.total ? (t.present / t.total) * 100 : 0 };
}

/** One student's periods on a given date (YYYY-MM-DD). */
export function attendanceOnDate(
  records: DayAttendanceRecord[], className: string, studentId: number, date: string,
): { subject: string; time: string; status: AttendanceStatus }[] {
  const id = String(studentId);
  const day = records.find((r) => r.className === className && r.date === date);
  if (!day) return [];
  return day.periods.flatMap((p) => {
    const entry = p.entries.find((e) => e.studentId === id);
    return entry ? [{ subject: p.subjectName, time: p.timeSlot, status: entry.status }] : [];
  });
}
