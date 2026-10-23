/** Who an announcement is for: "everyone", "staff", "students", or a class name like "Class 10-A". */
export type AudienceTarget = string;

export interface Announcement {
  id: number;
  title: string;
  content: string;
  from: string;
  fromRole: "principal" | "teacher" | "office";
  audience: AudienceTarget[];
  category: "academic" | "fees" | "event" | "general";
  priority: "high" | "medium" | "low";
  /** YYYY-MM-DD */
  date: string;
}

export interface Participant {
  /** For parents, `id` is their child's student id. */
  role: "student" | "teacher" | "parent";
  id: number;
  name: string;
}

export interface Message {
  id: number;
  from: Participant;
  to: Participant;
  subject: string;
  body: string;
  /** ISO timestamp */
  sentAt: string;
  read: boolean;
}
