/**
 * Notice board and messages, from the API (GET /announcements, GET /messages). Public website pages
 * read the school's public notices (GET /public/:school/announcements) without signing in.
 */
import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import { siteOrganization } from "@/api/site";
import type { Announcement, AudienceTarget, Message, Participant } from "@/types/communication";
import { can } from "./auth";
import { sectionGuid } from "./classes";
import { mutate, remoteStore, tempId } from "./remote";

interface ApiAnnouncement {
  id: string; title: string; body: string; category: string; priority: string; createdAt: string;
  fromName?: string; fromRole?: Announcement["fromRole"]; audience?: { type: string; sectionName: string | null }[];
}
interface ApiParty { kind: "teacher" | "staff" | "student" | "parent" | "user"; staffId: string | null; studentId: string | null; name: string }
interface ApiMessage { id: string; subject: string; body: string; sentAt: string; readAt: string | null; from: ApiParty; to: ApiParty }

const AUDIENCE_IN: Record<string, AudienceTarget> = { EVERYONE: "everyone", STAFF: "staff", STUDENTS: "students", PARENTS: "parents" };
const toAnnouncement = (a: ApiAnnouncement): Announcement => ({
  id: numId("announcement", a.id),
  title: a.title,
  content: a.body,
  from: a.fromName ?? "",
  fromRole: a.fromRole ?? "office",
  audience: a.audience ? a.audience.map((x) => (x.type === "SECTION" ? x.sectionName ?? "" : AUDIENCE_IN[x.type] ?? x.type.toLowerCase())) : ["everyone"],
  category: a.category.toLowerCase() as Announcement["category"],
  priority: a.priority.toLowerCase() as Announcement["priority"],
  date: a.createdAt.slice(0, 10),
});

const toParticipant = (p: ApiParty): Participant => ({
  role: p.kind === "student" ? "student" : p.kind === "parent" ? "parent" : "teacher",
  id: p.kind === "student" || p.kind === "parent" ? (p.studentId ? numId("student", p.studentId) : 0) : p.staffId ? numId("staff", p.staffId) : 0,
  name: p.name,
});
const toMessage = (m: ApiMessage): Message => ({
  id: numId("message", m.id), from: toParticipant(m.from), to: toParticipant(m.to), subject: m.subject, body: m.body, sentAt: m.sentAt, read: !!m.readAt,
});

export const announcementStore = remoteStore<Announcement[]>("announcements", [], async () => (await api.get<ApiAnnouncement[]>("/announcements")).map(toAnnouncement));
/** Principals see the school's messages (oversight); everyone else their own. */
export const messageStore = remoteStore<Message[]>("messages", [], async () =>
  (await api.get<ApiMessage[]>(can("reports.view") ? "/messages?scope=school" : "/messages")).map(toMessage));
/** The school's public notices (website, no sign-in). */
export const publicNoticeStore = remoteStore<Announcement[]>("public-notices", [], async () =>
  (await api.get<ApiAnnouncement[]>(`/public/${encodeURIComponent(siteOrganization())}/announcements`)).map(toAnnouncement));

export const useAnnouncements = () => announcementStore.useValue();
export const useMessages = () => messageStore.useValue();
export const usePublicNotices = () => publicNoticeStore.useValue();

const toApiAudience = (t: AudienceTarget) => {
  const type = Object.entries(AUDIENCE_IN).find(([, v]) => v === t)?.[0];
  if (type) return { type };
  const sectionId = sectionGuid(t);
  if (!sectionId) throw new Error(`${t} is not a class of this school.`);
  return { type: "SECTION", sectionId };
};

export function postAnnouncement(a: Omit<Announcement, "id" | "date">): Announcement {
  const id = tempId();
  const created = { ...a, id, date: new Date().toISOString().slice(0, 10) };
  void mutate(announcementStore, (list) => [created, ...list], async () => {
    const res = await api.post<{ id: string }>("/announcements", {
      title: a.title, body: a.content, category: a.category.toUpperCase(), priority: a.priority.toUpperCase(), audience: a.audience.map(toApiAudience),
    });
    announcementStore.set((list) => list.map((x) => (x.id === id ? { ...x, id: numId("announcement", res.id) } : x)));
  });
  return created;
}

export function removeAnnouncement(id: number) {
  void mutate(announcementStore, (list) => list.filter((a) => a.id !== id), () => api.del(`/announcements/${guidOf("announcement", id)}`));
}

const toApiRecipient = (p: Participant) =>
  p.role === "teacher" ? { kind: "staff", staffId: guidOf("staff", p.id) } : { kind: p.role, studentId: guidOf("student", p.id) };

export function sendMessage(from: Participant, to: Participant, subject: string, body: string): Message {
  const id = tempId();
  const created: Message = { id, from, to, subject, body, sentAt: new Date().toISOString(), read: false };
  void mutate(messageStore, (list) => [created, ...list], async () => {
    const res = await api.post<{ id: string }>("/messages", {
      to: toApiRecipient(to), subject, body, ...(from.role === "parent" ? { aboutStudentId: maybeGuid("student", from.id) } : {}),
    });
    messageStore.set((list) => list.map((m) => (m.id === id ? { ...m, id: numId("message", res.id) } : m)));
  });
  return created;
}

export function markMessageRead(id: number) {
  if (id < 0) return;
  void mutate(messageStore, (list) => list.map((m) => (m.id === id ? { ...m, read: true } : m)), () => api.post(`/messages/${guidOf("message", id)}/read`, {}));
}

/** Whether an announcement reaches a student of `cls`, or staff (cls undefined). */
export function isVisibleTo(a: Announcement, viewer: { role: "student"; cls: string } | { role: "staff" }): boolean {
  return a.audience.some((t) =>
    t === "everyone" || (viewer.role === "staff" ? t === "staff" : t === "students" || t === viewer.cls),
  );
}

export function audienceLabel(audience: AudienceTarget[]): string {
  const names: Record<string, string> = { everyone: "Everyone", staff: "All Staff", students: "All Students", parents: "All Parents" };
  return audience.map((t) => names[t] ?? t).join(", ");
}

/** Messages sent to / from a participant, newest first. */
export function messagesFor(list: Message[], who: Pick<Participant, "role" | "id">) {
  const is = (p: Participant) => p.role === who.role && p.id === who.id;
  return {
    inbox: list.filter((m) => is(m.to)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    sent: list.filter((m) => is(m.from)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
  };
}

/** "2 hours ago" style label. */
export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
