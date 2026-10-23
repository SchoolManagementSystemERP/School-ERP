/**
 * Transport, from the API (GET /transport): vehicles with their drivers, and routes with their stops.
 * A driver is a staff member (one is created when a new driver name is entered).
 */
import { api } from "@/api/client";
import { guidOf, maybeGuid, numId } from "@/api/ids";
import { canAny } from "./auth";
import { ifAllowed, mutate, remoteCollection, tempId } from "./remote";

export interface BusRoute {
  id: number;
  name: string;
  stops: string[];
  vehicleId: number | null;
  /** ₹ per month */
  monthlyFee: number;
  pickupTime: string;
}

export interface Vehicle {
  id: number;
  number: string;
  type: "Bus" | "Mini Bus" | "Van";
  capacity: number;
  driverName: string;
  driverPhone: string;
  /** YYYY-MM-DD */
  insuranceExpiry: string;
  /** YYYY-MM-DD */
  fitnessExpiry: string;
}

interface ApiTransport {
  vehicles: { id: string; registrationNo: string; type: string; capacity: number; driverName: string; driverPhone: string; insuranceExpiry: string; fitnessExpiry: string }[];
  routes: { id: string; name: string; vehicleId: string | null; monthlyFee: number; pickupTime: string; stops: { id: string; name: string; riders: string[] }[] }[];
}
const VEHICLE_TYPE: Record<string, Vehicle["type"]> = { BUS: "Bus", MINI_BUS: "Mini Bus", VAN: "Van" };

let request: Promise<ApiTransport | null> | null = null;
function fetchTransport() {
  request ??= (canAny("transport.manage", "reports.view") ? ifAllowed(api.get<ApiTransport>("/transport"), null) : Promise.resolve(null))
    .finally(() => setTimeout(() => { request = null; }, 0));
  return request;
}

const vehicleBase = remoteCollection<Vehicle>("vehicles", async () =>
  ((await fetchTransport())?.vehicles ?? []).map((v) => ({
    id: numId("vehicle", v.id), number: v.registrationNo, type: VEHICLE_TYPE[v.type] ?? "Bus", capacity: v.capacity, driverName: v.driverName, driverPhone: v.driverPhone ?? "",
    insuranceExpiry: v.insuranceExpiry, fitnessExpiry: v.fitnessExpiry,
  })));
const routeBase = remoteCollection<BusRoute>("routes", async () =>
  ((await fetchTransport())?.routes ?? []).map((r) => ({
    id: numId("route", r.id), name: r.name, stops: r.stops.map((s) => s.name), vehicleId: r.vehicleId ? numId("vehicle", r.vehicleId) : null, monthlyFee: r.monthlyFee, pickupTime: r.pickupTime,
  })));

const vehicleApi = (v: Omit<Vehicle, "id">) => ({
  registrationNo: v.number, type: v.type.toUpperCase().replace(/s+/g, "_"), capacity: Number(v.capacity), driverName: v.driverName || null, driverPhone: v.driverPhone || null,
  insuranceExpiry: v.insuranceExpiry, fitnessExpiry: v.fitnessExpiry,
});
const routeApi = (r: Omit<BusRoute, "id">) => ({
  name: r.name, vehicleId: r.vehicleId ? maybeGuid("vehicle", r.vehicleId) ?? null : null, monthlyFee: Number(r.monthlyFee), pickupTime: r.pickupTime, stops: r.stops.map((s) => s.trim()).filter(Boolean),
});

export const vehicleStore = Object.assign(vehicleBase, {
  add(record: Omit<Vehicle, "id">): Vehicle {
    const id = tempId();
    const created = { ...record, id };
    void mutate(vehicleBase, (l) => [...l, created], async () => {
      const res = await api.post<{ id: string }>("/transport/vehicles", vehicleApi(record));
      vehicleBase.set((l) => l.map((x) => (x.id === id ? { ...x, id: numId("vehicle", res.id) } : x)));
    });
    return created;
  },
  update(record: Vehicle) {
    void mutate(vehicleBase, (l) => l.map((x) => (x.id === record.id ? record : x)), () => api.patch(`/transport/vehicles/${guidOf("vehicle", record.id)}`, vehicleApi(record)));
  },
  remove(id: number) {
    void mutate(vehicleBase, (l) => l.filter((x) => x.id !== id), async () => {
      await api.del(`/transport/vehicles/${guidOf("vehicle", id)}`);
      routeBase.set((l) => l.map((r) => (r.vehicleId === id ? { ...r, vehicleId: null } : r)));
    });
  },
});

export const routeStore = Object.assign(routeBase, {
  add(record: Omit<BusRoute, "id">): BusRoute {
    const id = tempId();
    const created = { ...record, id };
    void mutate(routeBase, (l) => [...l, created], async () => {
      const res = await api.post<{ id: string }>("/transport/routes", routeApi(record));
      routeBase.set((l) => l.map((x) => (x.id === id ? { ...x, id: numId("route", res.id) } : x)));
    });
    return created;
  },
  update(record: BusRoute) {
    void mutate(routeBase, (l) => l.map((x) => (x.id === record.id ? record : x)), () => api.patch(`/transport/routes/${guidOf("route", record.id)}`, routeApi(record)));
  },
  remove(id: number) {
    void mutate(routeBase, (l) => l.filter((x) => x.id !== id), () => api.del(`/transport/routes/${guidOf("route", id)}`));
  },
});

export const useVehicles = () => vehicleBase.useItems();
export const useRoutes = () => routeBase.useItems();
