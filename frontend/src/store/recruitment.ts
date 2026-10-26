import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import { siteOrganization } from "@/api/site";
import { today } from "@/lib/dates";
import { can } from "./auth";
import { submitJobApplication } from "./publicSite";
import { ifAllowed, mutate, remoteStore, tempId } from "./remote";

// ── Job openings (posted by HR, shown on the school website's Careers page) ─

export type JobCategory = "Teaching" | "Non-Teaching" | "Administration" | "Support Staff";
export const JOB_CATEGORIES: JobCategory[] = ["Teaching", "Non-Teaching", "Administration", "Support Staff"];
export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Guest Faculty"] as const;

export interface JobOpening {
  id: number;
  title: string;
  department: string;
  category: JobCategory;
  employmentType: (typeof EMPLOYMENT_TYPES)[number];
  campus: string;
  vacancies: number;
  qualification: string;
  experience: string;
  salary: string;
  description: string;
  responsibilities: string[];
  /** YYYY-MM-DD */
  postedOn: string;
  /** YYYY-MM-DD */
  lastDate: string;
  isOpen: boolean;
}

interface ApiJob {
  id: string; campus: string | null; title: string; department: string; category: string; employmentType: string; vacancies: number; qualification: string;
  experience: string | null; salary: string | null; description: string; responsibilities: string[]; postedOn: string; lastDate: string; isOpen: boolean;
}
const CATEGORY: Record<string, JobCategory> = { TEACHING: "Teaching", NON_TEACHING: "Non-Teaching", ADMINISTRATION: "Administration", SUPPORT: "Support Staff" };
const JOB_TYPE: Record<string, JobOpening["employmentType"]> = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract", GUEST: "Guest Faculty" };
const key = <T extends string>(map: Record<string, T>, label: string) => Object.entries(map).find(([, v]) => v === label)?.[0] ?? label.toUpperCase();

const toJob = (j: ApiJob): JobOpening => ({
  id: numId("job", j.id), title: j.title, department: j.department, category: CATEGORY[j.category] ?? "Teaching", employmentType: JOB_TYPE[j.employmentType] ?? "Full-time",
  campus: j.campus ?? "", vacancies: j.vacancies, qualification: j.qualification, experience: j.experience ?? "", salary: j.salary ?? "", description: j.description,
  responsibilities: j.responsibilities, postedOn: j.postedOn, lastDate: j.lastDate, isOpen: j.isOpen,
});

/** Job openings: HR sees all of them (GET /jobs); the website and everyone else the open ones. */
export const jobStore = remoteStore<JobOpening[]>("job-openings", [], async () =>
  (await api.get<ApiJob[]>(can("staff.write") ? "/jobs" : `/public/${encodeURIComponent(siteOrganization())}/jobs`)).map(toJob));
export const useJobs = () => jobStore.useValue();

/** Open and not past the last date. */
export const isAcceptingApplications = (j: JobOpening) => j.isOpen && j.lastDate >= today();

const toApiJob = (job: Omit<JobOpening, "id" | "postedOn">) => ({
  title: job.title, department: job.department, category: key(CATEGORY, job.category), employmentType: key(JOB_TYPE, job.employmentType), campus: job.campus || null,
  vacancies: Number(job.vacancies), qualification: job.qualification, experience: job.experience || null, salary: job.salary || null, description: job.description,
  responsibilities: job.responsibilities.filter((r) => r.trim()), lastDate: job.lastDate, isOpen: job.isOpen,
});

export function saveJob(job: Omit<JobOpening, "id" | "postedOn"> & { id?: number }) {
  if (job.id) {
    const id = job.id;
    void mutate(jobStore, (list) => list.map((j) => (j.id === id ? { ...j, ...job, id } : j)), () => api.patch(`/jobs/${guidOf("job", id)}`, toApiJob(job)));
    return;
  }
  const temp = tempId();
  void mutate(jobStore, (list) => [{ ...job, id: temp, postedOn: today() }, ...list], async () => {
    const saved = await api.post<ApiJob>("/jobs", toApiJob(job));
    jobStore.set((list) => list.map((j) => (j.id === temp ? toJob(saved) : j)));
  });
}

export function setJobOpen(id: number, isOpen: boolean) {
  void mutate(jobStore, (list) => list.map((j) => (j.id === id ? { ...j, isOpen } : j)), () => api.patch(`/jobs/${guidOf("job", id)}`, { isOpen }));
}

// ── Applications ─────────────────────────────────────────────────────────────

export type ApplicationStatus = "Applied" | "Shortlisted" | "Interview" | "Selected" | "Rejected";
export const APPLICATION_STATUSES: ApplicationStatus[] = ["Applied", "Shortlisted", "Interview", "Selected", "Rejected"];

export interface JobApplication {
  id: number;
  /** null = general application ("send us your CV") */
  jobId: number | null;
  name: string;
  email: string;
  phone: string;
  qualification: string;
  experienceYears: number;
  currentEmployer: string;
  expectedSalary: string;
  coverLetter: string;
  resumeName: string;
  status: ApplicationStatus;
  /** YYYY-MM-DD */
  appliedOn: string;
  /** YYYY-MM-DD */
  interviewDate?: string;
  notes: string;
  /** Website, Referral, Job portal, Walk-in… */
  source: string;
  /** HR's screening score 0–100 (null = not screened) */
  screeningScore: number | null;
  screeningNotes: string;
}

interface ApiApplication {
  id: string; jobId: string | null; name: string; email: string; phone: string; qualification: string; experienceYears: number; currentEmployer: string | null;
  expectedSalary: string | null; coverLetter: string | null; resumeName: string | null; status: string; interviewDate: string | null; notes: string | null; appliedAt: string;
  source: string | null; screeningScore: number | null; screeningNotes: string | null;
}
const title = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

/** Applications received (GET /job-applications — HR). */
export const applicationStore = remoteStore<JobApplication[]>("job-applications", [], async () =>
  can("staff.write")
    ? (await ifAllowed(api.get<ApiApplication[]>("/job-applications"), [])).map((a) => ({
        id: numId("job-application", a.id), jobId: a.jobId ? numId("job", a.jobId) : null, name: a.name, email: a.email, phone: a.phone, qualification: a.qualification,
        experienceYears: a.experienceYears, currentEmployer: a.currentEmployer ?? "", expectedSalary: a.expectedSalary ?? "", coverLetter: a.coverLetter ?? "",
        resumeName: a.resumeName ?? "", status: title(a.status) as ApplicationStatus, appliedOn: a.appliedAt, notes: a.notes ?? "",
        source: a.source ?? "Website", screeningScore: a.screeningScore, screeningNotes: a.screeningNotes ?? "", ...(a.interviewDate ? { interviewDate: a.interviewDate } : {}),
      }))
    : []);
export const useApplications = () => applicationStore.useValue();

/** Sends an application from the website. Resolves to true when the school received it. */
export function submitApplication(a: Omit<JobApplication, "id" | "status" | "appliedOn" | "notes" | "interviewDate" | "source" | "screeningScore" | "screeningNotes">) {
  return submitJobApplication({ ...a, jobId: a.jobId != null ? maybeGuid("job", a.jobId) ?? null : null });
}

export function updateApplication(id: number, patch: Partial<JobApplication>) {
  void mutate(applicationStore, (list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)), () =>
    api.patch(`/job-applications/${guidOf("job-application", id)}`, {
      ...(patch.status ? { status: patch.status.toUpperCase() } : {}),
      ...(patch.interviewDate !== undefined ? { interviewDate: patch.interviewDate || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
      ...(patch.screeningScore !== undefined ? { screeningScore: patch.screeningScore } : {}),
      ...(patch.screeningNotes !== undefined ? { screeningNotes: patch.screeningNotes || null } : {}),
    }));
}

/** A candidate HR found itself (referral, job portal, walk-in). */
export async function addCandidate(c: { jobId: number | null; name: string; email: string; phone: string; qualification: string; experienceYears: number; currentEmployer: string; expectedSalary: string; source: string; notes: string }) {
  await api.post("/job-applications", {
    ...c, jobId: c.jobId != null ? guidOf("job", c.jobId) : null, currentEmployer: c.currentEmployer || null, expectedSalary: c.expectedSalary || null, notes: c.notes || null,
  });
  await applicationStore.load(true);
}
