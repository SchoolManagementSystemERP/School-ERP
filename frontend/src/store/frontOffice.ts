import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { today } from "@/lib/dates";
import { canAny } from "./auth";
import { ifAllowed, mutate, remoteStore, tempId } from "./remote";

// ── Admission enquiries ──────────────────────────────────────────────────────

export type EnquiryStatus = "New" | "Contacted" | "Visit Scheduled" | "Admitted" | "Closed";
export const ENQUIRY_STATUSES: EnquiryStatus[] = ["New", "Contacted", "Visit Scheduled", "Admitted", "Closed"];
export const ENQUIRY_SOURCES = ["Walk-in", "Phone", "Website", "Referral", "Newspaper", "Social Media"];

export interface Enquiry {
  id: number;
  studentName: string;
  parentName: string;
  phone: string;
  email: string;
  /** e.g. "9" */
  grade: string;
  source: string;
  status: EnquiryStatus;
  notes: string;
  /** YYYY-MM-DD */
  date: string;
  followUp?: string;
}

interface ApiEnquiry { id: string; studentName: string; parentName: string; phone: string; email: string | null; grade: string; source: string; status: string; notes: string | null; followUpDate: string | null; createdAt: string }
const STATUS: Record<string, EnquiryStatus> = { NEW: "New", CONTACTED: "Contacted", VISIT_SCHEDULED: "Visit Scheduled", ADMITTED: "Admitted", CLOSED: "Closed" };
const toEnquiry = (e: ApiEnquiry): Enquiry => ({
  id: numId("enquiry", e.id), studentName: e.studentName, parentName: e.parentName, phone: e.phone, email: e.email ?? "", grade: e.grade, source: e.source,
  status: STATUS[e.status] ?? "New", notes: e.notes ?? "", date: e.createdAt, ...(e.followUpDate ? { followUp: e.followUpDate } : {}),
});
const readable = () => canAny("frontoffice.manage", "reports.view");

/** Admission enquiries (GET /enquiries — reception, principal). Website enquiries arrive here too. */
export const enquiryStore = remoteStore<Enquiry[]>("enquiries", [], async () => (readable() ? (await ifAllowed(api.get<ApiEnquiry[]>("/enquiries"), [])).map(toEnquiry) : []));
export const useEnquiries = () => enquiryStore.useValue();

export function addEnquiry(e: Omit<Enquiry, "id" | "date" | "status">) {
  const id = tempId();
  void mutate(enquiryStore, (list): Enquiry[] => [{ ...e, id, date: today(), status: "New" }, ...list], async () => {
    const saved = await api.post<ApiEnquiry>("/enquiries", { studentName: e.studentName, parentName: e.parentName, phone: e.phone, email: e.email || null, grade: e.grade, source: e.source, notes: e.notes || null, followUpDate: e.followUp || null });
    enquiryStore.set((list) => list.map((x) => (x.id === id ? toEnquiry(saved) : x)));
  });
}

export function updateEnquiry(id: number, patch: Partial<Enquiry>) {
  void mutate(enquiryStore, (list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)), () =>
    api.patch(`/enquiries/${guidOf("enquiry", id)}`, {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
      ...(patch.followUp !== undefined ? { followUpDate: patch.followUp || null } : {}),
    }));
}

// ── Visitor log ──────────────────────────────────────────────────────────────

export interface Visitor {
  id: number;
  name: string;
  phone: string;
  purpose: string;
  toMeet: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  inTime: string;
  outTime?: string;
  people: number;
}

export const VISIT_PURPOSES = ["Parent meeting", "Admission enquiry", "Fee payment", "Delivery", "Vendor", "Interview", "Other"];

interface ApiVisitor { id: string; name: string; phone: string | null; purpose: string; toMeet: string; people: number; inAt: string; outAt: string | null }
const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const localTime = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
const toVisitor = (v: ApiVisitor): Visitor => ({
  id: numId("visitor", v.id), name: v.name, phone: v.phone ?? "", purpose: v.purpose, toMeet: v.toMeet, people: v.people,
  date: localDate(v.inAt), inTime: localTime(v.inAt), ...(v.outAt ? { outTime: localTime(v.outAt) } : {}),
});

/** The visitor log of the last 30 days (GET /visitors). */
export const visitorStore = remoteStore<Visitor[]>("visitors", [], async () => (readable() ? (await ifAllowed(api.get<ApiVisitor[]>("/visitors"), [])).map(toVisitor) : []));
export const useVisitors = () => visitorStore.useValue();

export function checkInVisitor(v: Omit<Visitor, "id" | "date" | "inTime" | "outTime">) {
  const id = tempId();
  const now = new Date().toISOString();
  void mutate(visitorStore, (list) => [{ ...v, id, date: localDate(now), inTime: localTime(now) }, ...list], async () => {
    const saved = await api.post<ApiVisitor>("/visitors", { name: v.name, phone: v.phone || null, purpose: v.purpose, toMeet: v.toMeet, people: v.people });
    visitorStore.set((list) => list.map((x) => (x.id === id ? toVisitor(saved) : x)));
  });
}

export function checkOutVisitor(id: number) {
  void mutate(visitorStore, (list) => list.map((v) => (v.id === id ? { ...v, outTime: localTime(new Date().toISOString()) } : v)), () => api.post(`/visitors/${guidOf("visitor", id)}/checkout`, {}));
}
