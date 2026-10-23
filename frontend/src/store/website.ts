import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { siteOrganization } from "@/api/site";
import { authStore, canAny } from "./auth";
import { ifAllowed, mutate, remoteStore } from "./remote";
import { submitAlumni, submitContactMessage, submitDemoRequest } from "./publicSite";

// ── School website profile (edited by the admin under Website) ──────────────

export interface SchoolBranch {
  name: string;
  address: string;
  phone: string;
}

export interface SchoolSite {
  name: string;
  shortName: string;
  tagline: string;
  motto: string;
  established: number;
  board: string;
  affiliationNo: string;
  schoolCode: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  whatsapp: string;
  officeHours: string;
  admissionsOpen: boolean;
  admissionYear: string;
  heroTitle: string;
  heroSubtitle: string;
  about: string;
  vision: string;
  mission: string[];
  principalName: string;
  principalQualification: string;
  principalMessage: string;
  chairmanName: string;
  chairmanMessage: string;
  stats: { students: number; teachers: number; resultPercent: number; campusAcres: number };
  social: { facebook: string; instagram: string; youtube: string; x: string };
  branches: SchoolBranch[];
}

const DEFAULT_SITE: SchoolSite = {
  name: "Greenwood International School",
  shortName: "GIS",
  tagline: "Rooted in values, reaching for the stars",
  motto: "Vidya Dadati Vinayam",
  established: 1998,
  board: "CBSE",
  affiliationNo: "2130456",
  schoolCode: "71245",
  address: "Plot 14, Sector 12, Gomti Nagar Extension",
  city: "Lucknow",
  state: "Uttar Pradesh",
  pincode: "226010",
  phone: "+91 522 400 1234",
  email: "office@greenwood.edu.in",
  whatsapp: "+91 98765 40000",
  officeHours: "Mon–Sat, 8:00 AM – 3:00 PM",
  admissionsOpen: true,
  admissionYear: "2027-28",
  heroTitle: "Where curious minds grow into confident leaders",
  heroSubtitle:
    "A CBSE co-educational school from Class 1 to 12 with smart classrooms, modern labs, sports and arts — and teachers who know every child by name.",
  about:
    "Greenwood International School was founded in 1998 by the Greenwood Education Trust with 120 students and a simple belief: every child can excel when they are known, challenged and cared for. Today more than 2,400 students learn on our 12-acre campus, guided by 140 qualified teachers.\n\nWe balance strong academics with sport, music, art, community service and life skills, so that our students leave school ready for college — and for life.",
  vision: "To nurture lifelong learners who think independently, act with integrity and serve society with compassion.",
  mission: [
    "Deliver rigorous, joyful learning that builds deep understanding, not rote memory.",
    "Give every child opportunities in sport, arts and leadership alongside academics.",
    "Partner closely with parents through transparent, regular communication.",
    "Build character: honesty, respect, responsibility and care for the environment.",
  ],
  principalName: "Dr. Meenakshi Srivastava",
  principalQualification: "M.Sc., M.Ed., Ph.D. (Education) · 26 years in education",
  principalMessage:
    "Dear parents and students, a school is not just a building — it is a community that believes in every child. At Greenwood we want each student to discover what they love, work hard at it and grow into a kind, confident and capable person. Our doors are always open: come and see our classrooms, meet our teachers and talk to us about your child.",
  chairmanName: "Shri Alok Narayan",
  chairmanMessage:
    "Twenty-eight years ago we set out to build a school that combines Indian values with a global outlook. I am proud of what our students, teachers and parents have built together, and we continue to invest in facilities, training and technology so that every child gets the best.",
  stats: { students: 2400, teachers: 140, resultPercent: 99.2, campusAcres: 12 },
  social: { facebook: "https://facebook.com", instagram: "https://instagram.com", youtube: "https://youtube.com", x: "https://x.com" },
  branches: [
    { name: "Main Campus, Gomti Nagar", address: "Plot 14, Sector 12, Gomti Nagar Extension, Lucknow 226010", phone: "+91 522 400 1234" },
    { name: "Junior Wing, Aliganj", address: "B-7, Sector H, Aliganj, Lucknow 226024", phone: "+91 522 400 5678" },
  ],
};

/**
 * The website profile. Signed-in staff read GET /website (admins edit it with PUT /website); visitors
 * of the public site read GET /public/:school/site. Until it loads, the default profile is shown.
 */
export const siteStore = remoteStore<SchoolSite>("school-site", DEFAULT_SITE, async () => {
  const site = authStore.get().role
    ? await api.get<SchoolSite | null>("/website")
    : await api.get<SchoolSite>(`/public/${encodeURIComponent(siteOrganization())}/site`).catch(() => null);
  return { ...DEFAULT_SITE, ...(site ?? {}) };
});
export const useSite = () => siteStore.useValue();

export function updateSite(patch: Partial<SchoolSite>) {
  void mutate(siteStore, (s) => ({ ...s, ...patch }), () => api.put("/website", { ...siteStore.get() }));
}

// ── Messages sent from the public website ────────────────────────────────────

export type FeedbackKind = "Contact" | "Grievance" | "Feedback";
export interface FeedbackMessage {
  id: number;
  kind: FeedbackKind;
  name: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
  /** YYYY-MM-DD */
  date: string;
  resolved: boolean;
}

interface ApiContact { id: string; kind: string; name: string; phone: string; email: string | null; subject: string; message: string; resolved: boolean; createdAt: string }
const title = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

/** Messages from the website, for the office (GET /website/messages). */
export const feedbackStore = remoteStore<FeedbackMessage[]>("site-feedback", [], async () =>
  canAny("org.manage", "frontoffice.manage")
    ? (await ifAllowed(api.get<ApiContact[]>("/website/messages"), [])).map((m) => ({
        id: numId("contact", m.id), kind: title(m.kind) as FeedbackKind, name: m.name, phone: m.phone, email: m.email ?? "",
        subject: m.subject, message: m.message, date: m.createdAt, resolved: m.resolved,
      }))
    : []);
export const useFeedback = () => feedbackStore.useValue();

/** Sends a contact / grievance / feedback message from the website. Resolves to true when received. */
export const sendFeedback = (m: Omit<FeedbackMessage, "id" | "date" | "resolved">) => submitContactMessage(m);

export function setFeedbackResolved(id: number, resolved: boolean) {
  void mutate(feedbackStore, (list) => list.map((f) => (f.id === id ? { ...f, resolved } : f)), () => api.patch(`/website/messages/${guidOf("contact", id)}`, { resolved }));
}

// ── Alumni register ──────────────────────────────────────────────────────────

export interface AlumniEntry {
  id: number;
  name: string;
  batch: string;
  email: string;
  phone: string;
  occupation: string;
  city: string;
  /** YYYY-MM-DD */
  date: string;
}

interface ApiAlumni { id: string; name: string; batch: number; email: string; phone: string | null; occupation: string | null; city: string | null; createdAt: string }
export const alumniStore = remoteStore<AlumniEntry[]>("alumni", [], async () =>
  canAny("org.manage", "frontoffice.manage")
    ? (await ifAllowed(api.get<ApiAlumni[]>("/website/alumni"), [])).map((a) => ({
        id: numId("alumni", a.id), name: a.name, batch: String(a.batch), email: a.email, phone: a.phone ?? "", occupation: a.occupation ?? "", city: a.city ?? "", date: a.createdAt,
      }))
    : []);
export const useAlumni = () => alumniStore.useValue();

/** Registers a former student from the website. Resolves to true when received. */
export const registerAlumni = (a: Omit<AlumniEntry, "id" | "date">) => submitAlumni(a);

// ── Demo requests from the product (SchoolERP) website ───────────────────────

export interface DemoLead {
  id: number;
  name: string;
  institution: string;
  role: string;
  phone: string;
  email: string;
  city: string;
  branches: string;
  students: string;
  message: string;
  /** YYYY-MM-DD */
  date: string;
}

/** Sends a demo request to the SchoolERP team. Resolves to true when received. */
export const addLead = (l: Omit<DemoLead, "id" | "date">) => submitDemoRequest(l);
