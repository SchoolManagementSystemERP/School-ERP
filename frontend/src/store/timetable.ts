/**
 * Subjects and the class timetable, from the API (GET /subjects, GET /timetable).
 * Pages read the timetable in the shape the old static plan had: short class name ("10-A") →
 * that day's periods, with the teacher's employee code as `teacherId`.
 */
import { useMemo } from "react";
import { api } from "@/api/client";
import type { SubjectPeriod } from "@/types/attendance";
import { remoteStore } from "./remote";

export interface ApiSubject { id: string; code: string; name: string }
export interface ApiPeriod {
  id: string; sectionId: string; grade: string; section: string; room: string | null;
  dayOfWeek: number; periodNo: number; startTime: string; endTime: string;
  subjectId: string; subjectCode: string; subjectName: string;
  teacherId: string | null; teacherName: string | null; teacherCode: string | null;
}
export type PlannedPeriod = Omit<SubjectPeriod, "entries">;

export const subjectStore = remoteStore<ApiSubject[]>("subjects", [], () => api.get<ApiSubject[]>("/subjects"));
export const timetableStore = remoteStore<ApiPeriod[]>("timetable", [], () => api.get<ApiPeriod[]>("/timetable"));

export const useSubjects = () => subjectStore.useValue();

/** GUID of a subject by name or code (case-insensitive). */
export function subjectGuid(name: string): string | undefined {
  const q = name.trim().toLowerCase();
  return subjectStore.get().find((s) => s.name.toLowerCase() === q || s.code.toLowerCase() === q)?.id;
}

/** Subject GUID, or an error that says what to set up. */
export function requireSubject(name: string): string {
  const id = subjectGuid(name);
  if (!id) throw new Error(`Subject “${name}” is not set up for this school.`);
  return id;
}

export const subjectNameOf = (guid: string) => subjectStore.get().find((s) => s.id === guid.toLowerCase())?.name ?? "";

/** "Class 10" + "A" → "10-A" */
const shortName = (p: Pick<ApiPeriod, "grade" | "section">) => `${p.grade.replace(/^Class\s+/i, "")}-${p.section}`;

const toPlanned = (p: ApiPeriod): PlannedPeriod => ({
  periodNo: p.periodNo,
  timeSlot: `${p.startTime}–${p.endTime}`,
  subjectCode: p.subjectCode,
  subjectName: p.subjectName,
  teacherName: p.teacherName ?? "",
  teacherId: p.teacherCode ?? "",
});

/** Weekly plan: class → day (1 = Monday) → periods in order. */
export function weeklyPlan(periods: ApiPeriod[]): Record<string, Record<number, PlannedPeriod[]>> {
  const out: Record<string, Record<number, PlannedPeriod[]>> = {};
  for (const p of periods) ((out[shortName(p)] ??= {})[p.dayOfWeek] ??= []).push(toPlanned(p));
  for (const days of Object.values(out)) for (const list of Object.values(days)) list.sort((a, b) => a.periodNo - b.periodNo);
  return out;
}

/**
 * One day's plan per class. Defaults to the first school day each class has periods on
 * (most schools repeat the same plan; pass `dayOfWeek` for a specific day).
 */
export function dailyPlan(periods: ApiPeriod[], dayOfWeek?: number): Record<string, PlannedPeriod[]> {
  const out: Record<string, PlannedPeriod[]> = {};
  for (const [cls, days] of Object.entries(weeklyPlan(periods))) {
    const day = dayOfWeek && days[dayOfWeek] ? dayOfWeek : Math.min(...Object.keys(days).map(Number));
    out[cls] = days[day] ?? [];
  }
  return out;
}

/** Day of week for a date string (1 = Monday … 7 = Sunday). */
export const dayOfWeekOf = (date: string) => ((new Date(`${date}T00:00:00`).getDay() + 6) % 7) + 1;

/** The class timetable (short class name → periods) for today or a given day. */
export function useClassTimetable(dayOfWeek?: number) {
  const periods = timetableStore.useValue();
  return useMemo(() => dailyPlan(periods, dayOfWeek), [periods, dayOfWeek]);
}

export const getClassTimetable = (dayOfWeek?: number) => dailyPlan(timetableStore.get(), dayOfWeek);
export const useWeeklyTimetable = () => {
  const periods = timetableStore.useValue();
  return useMemo(() => weeklyPlan(periods), [periods]);
};

/** "09:30" → "09:30 AM" */
export function to12h(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "09:30 AM" / "14:00" → "09:30" / "14:00" */
export function to24h(t: string) {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return "";
  let h = Number(m[1]);
  if (m[3]?.toUpperCase() === "PM" && h < 12) h += 12;
  if (m[3]?.toUpperCase() === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** "09:30 AM – 12:30 PM" → ["09:30", "12:30"] */
export function parseTimeRange(s: string): [string, string] {
  const [a = "", b = ""] = s.split(/\s*[–-]\s*/);
  return [to24h(a) || "09:30", to24h(b) || "12:30"];
}
