export interface AssignmentSubmission {
  studentId: number;
  /** YYYY-MM-DD */
  submittedAt: string;
  fileName: string;
  /** Set once the teacher grades it. */
  marksObtained?: number;
  feedback?: string;
}

export interface Assignment {
  id: number;
  title: string;
  subject: string;
  /** e.g. "Class 10-A" */
  class: string;
  description: string;
  teacher: string;
  /** YYYY-MM-DD */
  assignedDate: string;
  /** YYYY-MM-DD */
  dueDate: string;
  totalMarks: number;
  submissions: AssignmentSubmission[];
}

/** Overall state of an assignment, derived from its dates. */
export type AssignmentStatus = "upcoming" | "active" | "closed";

/** One student's state for an assignment. */
export type StudentAssignmentStatus = "pending" | "submitted" | "graded" | "overdue";
