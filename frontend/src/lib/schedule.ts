import { getClassTimetable } from "@/store/timetable";

export interface TeachingPeriod {
  /** e.g. "Class 10-A" */
  class: string;
  subject: string;
  /** e.g. "08:45 - 09:30" */
  time: string;
  room: string;
  periodNo: number;
}

/** A teacher's daily periods across all classes, in time order (same plan every school day). */
export function teacherPeriods(teacherName: string | undefined): TeachingPeriod[] {
  if (!teacherName) return [];
  return Object.entries(getClassTimetable())
    .flatMap(([cls, periods]) => periods
      .filter((p) => p.teacherName === teacherName)
      .map((p) => ({ class: `Class ${cls}`, subject: p.subjectName, time: p.timeSlot.replace("–", " - "), room: `Room ${cls}`, periodNo: p.periodNo })))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export const SCHOOL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
