import { api } from "@/api/client";
import { guidOf, numId } from "@/api/ids";
import { today } from "@/lib/dates";
import { canAny } from "./auth";
import { ifAllowed, mutate, remoteCollection, remoteStore, tempId } from "./remote";

export interface Room {
  id: number;
  block: string;
  number: string;
  capacity: number;
  type: "Boys" | "Girls";
}

export interface Resident {
  studentId: number;
  roomId: number;
  /** YYYY-MM-DD */
  since: string;
}

export interface Outpass {
  id: number;
  studentId: number;
  from: string;
  to: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected" | "Returned";
  requestedOn: string;
}

interface ApiHostel {
  rooms: { id: string; block: string; number: string; capacity: number; type: "BOYS" | "GIRLS" }[];
  residents: { studentId: string; roomId: string; since: string }[];
  outpasses: { id: string; studentId: string; fromDate: string; toDate: string; reason: string; status: string; createdAt: string }[];
}
const title = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

let request: Promise<ApiHostel | null> | null = null;
function fetchHostel() {
  request ??= (canAny("hostel.manage", "reports.view") ? ifAllowed(api.get<ApiHostel>("/hostel"), null) : Promise.resolve(null))
    .finally(() => setTimeout(() => { request = null; }, 0));
  return request;
}

/** Hostel rooms, residents and outpasses, from the API (GET /hostel). */
export const roomStore = remoteCollection<Room>("hostel-rooms", async () =>
  ((await fetchHostel())?.rooms ?? []).map((r) => ({ id: numId("room", r.id), block: r.block, number: r.number, capacity: r.capacity, type: title(r.type) as Room["type"] })));
export const residentStore = remoteStore<Resident[]>("hostel-residents", [], async () =>
  ((await fetchHostel())?.residents ?? []).map((r) => ({ studentId: numId("student", r.studentId), roomId: numId("room", r.roomId), since: r.since })));
const toOutpass = (o: ApiHostel["outpasses"][number]): Outpass => ({
  id: numId("outpass", o.id), studentId: numId("student", o.studentId), from: o.fromDate, to: o.toDate, reason: o.reason, status: title(o.status) as Outpass["status"], requestedOn: o.createdAt,
});
export const outpassStore = remoteStore<Outpass[]>("outpasses", [], async () => ((await fetchHostel())?.outpasses ?? []).map(toOutpass));

export const useRooms = () => roomStore.useItems();
export const useResidents = () => residentStore.useValue();
export const useOutpasses = () => outpassStore.useValue();

/** Puts a student in a room (the server checks capacity and boys / girls). */
export function allocateRoom(studentId: number, roomId: number) {
  void mutate(residentStore, (list) => [...list.filter((r) => r.studentId !== studentId), { studentId, roomId, since: today() }], () =>
    api.post("/hostel/allocations", { studentId: guidOf("student", studentId), roomId: guidOf("room", roomId) }));
}

export function vacate(studentId: number) {
  void mutate(residentStore, (list) => list.filter((r) => r.studentId !== studentId), () => api.post(`/hostel/residents/${guidOf("student", studentId)}/vacate`, {}));
}

export function setOutpassStatus(id: number, status: Outpass["status"]) {
  void mutate(outpassStore, (list) => list.map((o) => (o.id === id ? { ...o, status } : o)), () => api.patch(`/hostel/outpasses/${guidOf("outpass", id)}`, { status: status.toUpperCase() }));
}

export function requestOutpass(o: Omit<Outpass, "id" | "status" | "requestedOn">) {
  const id = tempId();
  void mutate(outpassStore, (list): Outpass[] => [{ ...o, id, status: "Pending", requestedOn: today() }, ...list], async () => {
    const saved = await api.post<ApiHostel["outpasses"][number]>("/hostel/outpasses", { studentId: guidOf("student", o.studentId), fromDate: o.from, toDate: o.to, reason: o.reason });
    outpassStore.set((list) => list.map((x) => (x.id === id ? toOutpass(saved) : x)));
  });
}

/** Students away on an approved outpass today. */
export const isOut = (passes: Outpass[], studentId: number) =>
  passes.some((o) => o.studentId === studentId && o.status === "Approved" && o.from <= today() && o.to >= today());
