/**
 * Period-wise attendance, from the API (GET /attendance — the last 120 days). Pages keep the
 * old shape: one record per class per day, with that day's timetable periods and each period's
 * entries (student ids as strings). Saving sends one register per period (PUT /attendance).
 */
import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import type { AttendanceStatus, DayAttendanceRecord, SubjectPeriod } from "@/types/attendance";
import { mayRead } from "./auth";
import { sectionGuid, sectionStore } from "./classes";
import { ifAllowed, mutate, remoteStore } from "./remote";
import { dayOfWeekOf, getClassTimetable, subjectGuid, subjectNameOf, subjectStore, timetableStore } from "./timetable";

/** Students below this percentage are flagged as low attendance. */
export const LOW_ATTENDANCE_THRESHOLD = 75;

interface ApiSession { id: string; sectionId: string; date: string; periodNo: number | null; subjectId: string | null; entries: { studentId: string; status: string }[] }

const toStatus = (s: string): AttendanceStatus => (s === "ABSENT" ? "absent" : s === "LEAVE" ? "leave" : "present");

async function load(): Promise<DayAttendanceRecord[]> {
  await Promise.all([timetableStore.load(), sectionStore.load(), subjectStore.load()]);
  const sessions = mayRead("attendance.read") ? await ifAllowed(api.get<ApiSession[]>("/attendance"), []) : [];
  const shortBySection = new Map(sectionStore.get().map((s) => [maybeGuid("section", s.id) ?? "", `${s.className.replace(/^Class\s+/i, "")}-${s.section}`]));

  const days = new Map<string, DayAttendanceRecord>();
  for (const s of sessions) {
    const className = shortBySection.get(s.sectionId.toLowerCase());
    if (!className) continue;
    const key = `${className}|${s.date}`;
    let day = days.get(key);
    if (!day) {
      const plan = getClassTimetable(dayOfWeekOf(s.date))[className] ?? [];
      day = { date: s.date, className, periods: plan.map((p) => ({ ...p, entries: [] })) };
      days.set(key, day);
    }
    const periodNo = s.periodNo ?? 0;
    let period = day.periods.find((p) => p.periodNo === periodNo);
    if (!period) {
      const name = s.subjectId ? subjectNameOf(s.subjectId) : "Daily";
      period = { periodNo, timeSlot: "", subjectCode: "", subjectName: name, teacherName: "", teacherId: "", entries: [] } as SubjectPeriod;
      day.periods.push(period);
      day.periods.sort((a, b) => a.periodNo - b.periodNo);
    }
    period.entries = s.entries.map((e) => ({ studentId: String(numId("student", e.studentId)), status: toStatus(e.status) }));
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className));
}

export const attendanceStore = remoteStore<DayAttendanceRecord[]>("attendance", [], load);

/** Shared period-wise attendance records. */
export function useAttendanceRecords() {
  return attendanceStore.useValue();
}

/** Sends one period's register to the API. */
function putPeriod(className: string, date: string, period: Pick<SubjectPeriod, "periodNo" | "subjectName" | "entries">) {
  const sectionId = sectionGuid(`Class ${className}`);
  if (!sectionId) throw new Error(`Class ${className} is not set up.`);
  return api.put("/attendance", {
    sectionId,
    date,
    periodNo: period.periodNo || null,
    subjectId: subjectGuid(period.subjectName) ?? null,
    entries: period.entries.map((e) => ({ studentId: guidOf("student", Number(e.studentId)), status: e.status.toUpperCase() })),
  });
}

/** Saves edited records: every period whose entries changed is sent to the API. */
export function saveAttendanceRecords(records: DayAttendanceRecord[]) {
  const before = new Map(attendanceStore.get().map((r) => [`${r.className}|${r.date}`, r]));
  const changed: { className: string; date: string; period: SubjectPeriod }[] = [];
  for (const r of records) {
    const old = before.get(`${r.className}|${r.date}`);
    for (const p of r.periods) {
      if (!p.entries.length) continue;
      const prev = old?.periods.find((x) => x.periodNo === p.periodNo);
      if (!prev || JSON.stringify(prev.entries) !== JSON.stringify(p.entries)) changed.push({ className: r.className, date: r.date, period: p });
    }
  }
  if (!changed.length) {
    attendanceStore.set(records);
    return;
  }
  void mutate(attendanceStore, () => records, () => Promise.all(changed.map((c) => putPeriod(c.className, c.date, c.period))));
}

/**
 * Saves a teacher's attendance for one subject into that subject's period of the class
 * timetable on the given date. Returns false if the subject has no period in the class.
 */
export function recordSubjectAttendance(
  className: string,
  date: string,
  subjectName: string,
  statuses: Record<string, AttendanceStatus>,
): boolean {
  const plan = getClassTimetable(dayOfWeekOf(date))[className] ?? [];
  const period = plan.find((p) => p.subjectName === subjectName);
  if (!period) return false;

  const entries = Object.entries(statuses).map(([studentId, status]) => ({ studentId, status }));
  void mutate(
    attendanceStore,
    (records) => {
      const existing = records.find((r) => r.className === className && r.date === date);
      const day = existing ?? { date, className, periods: plan.map((p) => ({ ...p, entries: [] })) };
      const updated = { ...day, periods: day.periods.map((p) => (p.periodNo === period.periodNo ? { ...p, entries } : p)) };
      return existing ? records.map((r) => (r === existing ? updated : r)) : [...records, updated];
    },
    () => putPeriod(className, date, { ...period, entries }),
  );
  return true;
}
