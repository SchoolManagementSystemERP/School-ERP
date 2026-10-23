/**
 * Data and forms of the public school website (no sign-in): GET/POST /public/:school/… The school is
 * chosen by siteOrganization(). Form helpers resolve to true when the school received the submission;
 * otherwise the reason is shown and they resolve to false, so pages only thank the visitor on success.
 */
import { toast } from "sonner";
import { api, errorMessage } from "@/api/client";
import { numId } from "@/api/ids";
import { siteOrganization } from "@/api/site";
import type { Exam } from "./exams";
import { remoteStore } from "./remote";
import { to12h } from "./timetable";

const path = (p: string) => `/public/${encodeURIComponent(siteOrganization())}${p}`;
const gradeNo = (name: string) => Number(name.replace(/\D+/g, " ").trim().split(" ")[0]) || 0;

interface ApiPublicExam { id: string; name: string; gradeNames: string[]; papers: { subjectName: string; date: string; startTime: string; endTime: string }[] }
export interface FacultyMember { id: number; name: string; designation: string; department: string; highestQualification: string; experience: string; bEd: boolean; status: "Active" }

/** Exam datesheets that are not over yet. */
export const publicExamStore = remoteStore<Exam[]>("public-exams", [], async () =>
  (await api.get<ApiPublicExam[]>(path("/exams"))).map((e) => ({
    id: numId("exam", e.id), name: e.name, grades: e.gradeNames.map(gradeNo).filter(Boolean), resultsPublished: false,
    papers: e.papers.map((p) => ({ subject: p.subjectName, date: p.date, time: `${to12h(p.startTime)} – ${to12h(p.endTime)}` })),
  })));

/** Annual tuition per grade number. */
export const publicFeeStore = remoteStore<Record<number, number>>("public-fees", {}, async () =>
  Object.fromEntries((await api.get<{ grade: string; annualAmount: number }[]>(path("/fees"))).map((f) => [gradeNo(f.grade), f.annualAmount])));

/** Teachers shown on the Faculty page (no contact details). */
export const publicFacultyStore = remoteStore<FacultyMember[]>("public-faculty", [], async () =>
  (await api.get<(Omit<FacultyMember, "id" | "status"> & { id: string; department: string | null })[]>(path("/faculty"))).map((t) => ({
    ...t, id: numId("staff", t.id), department: t.department ?? "", highestQualification: String(t.highestQualification ?? ""), experience: String(t.experience ?? ""), status: "Active" as const,
  })));

export const usePublicExams = () => publicExamStore.useValue();
export const usePublicFees = () => publicFeeStore.useValue();
export const usePublicFaculty = () => publicFacultyStore.useValue();

async function submit(p: string, body: unknown): Promise<boolean> {
  try {
    await api.post(p, body);
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
}

export const submitWebsiteEnquiry = (e: { studentName: string; parentName: string; phone: string; email: string; grade: string; notes: string }) => submit(path("/enquiries"), e);

export const submitJobApplication = (a: {
  jobId: string | null; name: string; email: string; phone: string; qualification: string; experienceYears: number;
  currentEmployer: string; expectedSalary: string; coverLetter: string; resumeName: string;
}) => submit(path("/applications"), a);

export const submitContactMessage = (m: { kind: "Contact" | "Grievance" | "Feedback"; name: string; phone: string; email: string; subject: string; message: string }) =>
  submit(path("/contact"), { ...m, kind: m.kind.toUpperCase() });

export const submitAlumni = (a: { name: string; batch: string; email: string; phone: string; occupation: string; city: string }) => submit(path("/alumni"), a);

/** Demo request from the SchoolERP product website (not tied to a school). */
export const submitDemoRequest = (l: { name: string; institution: string; role: string; phone: string; email: string; city: string; branches: string; students: string; message: string }) =>
  submit("/public/demo-requests", { name: l.name, institution: l.institution, role: l.role, phone: l.phone, email: l.email, city: l.city, campuses: l.branches, students: l.students, message: l.message });
