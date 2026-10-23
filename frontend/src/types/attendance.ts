export type AttendanceStatus = "present" | "absent" | "leave";

export interface SubjectAttendanceEntry {
  /** Student id as a string. */
  studentId: string;
  status: AttendanceStatus;
}

export interface SubjectPeriod {
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  teacherId: string;
  timeSlot: string;
  periodNo: number;
  entries: SubjectAttendanceEntry[];
}

export interface DayAttendanceRecord {
  /** YYYY-MM-DD */
  date: string;
  /** Short class name, e.g. "10-A". */
  className: string;
  periods: SubjectPeriod[];
}
