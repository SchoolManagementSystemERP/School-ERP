/**
 * Library, inventory, transport and hostel over HTTP, against the "greenwood" demo organization:
 *   npm run test:facilities
 * Everything it creates is removed at the end.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";

let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, extra?: unknown) => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ✓" : "  ✗"} ${label}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function login(username: string) {
  const r = await call(null, "POST", "/auth/login", { organization: "greenwood", username, password: "Demo@1234" });
  if (r.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

const TAG = `fac-test-${Date.now()}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const created = { books: [] as string[], items: [] as string[], vehicles: [] as string[], routes: [] as string[], outpasses: [] as string[], drivers: [] as string[] };
let hostelRestore: { studentId: string; roomId: string | null } | null = null;

async function main() {
  const librarian = await login("librarian");
  const store = await login("inventory");
  const transport = await login("transport");
  const warden = await login("warden");
  const principal = await login("principal");
  const teacher = await login("T002");
  const roster = (await call(principal, "GET", "/students/full")).body as { id: string; gender: string | null; branchId: string }[];

  console.log("Library");
  const book = await call(librarian, "POST", "/library/books", { title: TAG, author: "Test Author", category: "Fiction", totalCopies: 1 });
  if (book.body?.id) created.books.push(book.body.id);
  ok(book.status === 201, "the librarian adds a book", book.body);
  ok((await call(teacher, "POST", "/library/books", { title: "x", author: "y", category: "z", totalCopies: 1 })).status === 403, "a teacher cannot add books");
  const loan = await call(librarian, "POST", "/library/loans", { bookId: book.body.id, studentId: roster[0].id, issueDate: day(-20), dueDate: day(-6) });
  ok(loan.status === 201, "the librarian issues it (backdated, now overdue)", loan.body);
  ok((await call(librarian, "POST", "/library/loans", { bookId: book.body.id, studentId: roster[1].id, issueDate: day(0), dueDate: day(14) })).status === 409, "no copies left → cannot issue again");
  ok((await call(librarian, "PATCH", `/library/books/${book.body.id}`, { totalCopies: 0 })).status === 400, "copies cannot drop below those on loan");
  ok((await call(librarian, "DELETE", `/library/books/${book.body.id}`)).status === 400, "a book on loan cannot be deleted");
  const lib = (await call(principal, "GET", "/library")).body as { finePerDay: number; books: { id: string }[] };
  ok(lib.books.some((b) => b.id === book.body.id), "the principal sees the library");
  const ret = await call(librarian, "POST", `/library/loans/${loan.body.id}/return`, {});
  ok(ret.status === 200 && ret.body.finePaid === 6 * lib.finePerDay, "returning it charges the late fine (6 days)", ret.body);
  ok((await call(librarian, "POST", `/library/loans/${loan.body.id}/return`, {})).status === 409, "it cannot be returned twice");
  ok((await call(librarian, "DELETE", `/library/books/${book.body.id}`)).status === 204, "then the book can be deleted");
  created.books = [];

  console.log("Inventory");
  ok(((await call(teacher, "GET", "/inventory/items")).body as unknown[]).length > 0, "teachers see the item catalogue (for requisitions)");
  ok((await call(teacher, "GET", "/inventory/movements")).status === 403, "…but not the stock register");
  const item = await call(store, "POST", "/inventory/items", { sku: TAG.slice(-12), name: TAG, category: "Stationery", unit: "pcs", location: "Main Store", quantity: 10, minQuantity: 5, unitPrice: 12.5, condition: "Good" });
  if (item.body?.id) created.items.push(item.body.id);
  ok(item.status === 201 && item.body.quantity === 10, "the store keeper adds an item with opening stock", item.body);
  ok((await call(store, "POST", "/inventory/items", { sku: TAG.slice(-12), name: "dup", category: "x", unit: "pcs", location: "x", quantity: 0, minQuantity: 0, unitPrice: 0, condition: "Good" })).status === 409, "SKUs are unique");
  ok((await call(store, "POST", `/inventory/items/${item.body.id}/movements`, { type: "OUT", quantity: 11 })).status === 400, "cannot issue more than in stock");
  const out = await call(store, "POST", `/inventory/items/${item.body.id}/movements`, { type: "OUT", quantity: 4, note: "Lab" });
  ok(out.status === 201 && out.body.item.quantity === 6, "stock out reduces the quantity", out.body);
  const moves = (await call(principal, "GET", "/inventory/movements")).body as { itemId: string; type: string }[];
  ok(moves.filter((m) => m.itemId === item.body.id).length === 2, "the register shows opening stock and the issue");
  ok((await call(teacher, "PUT", "/inventory/settings", {})).status === 403, "a teacher cannot change inventory settings");
  const settings = (await call(store, "GET", "/inventory/settings")).body;
  ok(settings?.categories?.length > 0, "inventory settings are stored in the database", settings);
  ok((await call(store, "PUT", "/inventory/settings", settings)).status === 200, "the store keeper saves settings");
  ok((await call(store, "DELETE", `/inventory/items/${item.body.id}`)).status === 204, "an unused item can be deleted");
  created.items = [];

  console.log("Transport");
  const vehicle = await call(transport, "POST", "/transport/vehicles", { registrationNo: `TS${Date.now() % 1_000_000}`, type: "Mini Bus", capacity: 20, driverName: `${TAG} Driver`, driverPhone: "9000012345", insuranceExpiry: day(200), fitnessExpiry: day(100) });
  if (vehicle.body?.id) created.vehicles.push(vehicle.body.id);
  ok(vehicle.status === 201, "the transport manager adds a vehicle (and its new driver)", vehicle.body);
  const route = await call(transport, "POST", "/transport/routes", { name: TAG.slice(-20), vehicleId: vehicle.body.id, monthlyFee: 1500, pickupTime: "07:05", stops: ["Stop A", "Stop B", "School"] });
  if (route.body?.id) created.routes.push(route.body.id);
  ok(route.status === 201, "…and a route with stops", route.body);
  ok((await call(transport, "POST", "/transport/routes", { name: "x", monthlyFee: 1, pickupTime: "07:00", stops: ["A", "a"] })).status === 400, "a stop cannot appear twice");
  await call(transport, "PATCH", `/transport/routes/${route.body.id}`, { stops: ["Stop B", "Stop C", "School"] });
  const t = (await call(principal, "GET", "/transport")).body as { vehicles: { id: string; driverName: string }[]; routes: { id: string; stops: { name: string }[] }[] };
  ok(t.routes.find((r) => r.id === route.body.id)?.stops.map((s) => s.name).join(",") === "Stop B,Stop C,School", "editing a route reorders and replaces its stops");
  ok(t.vehicles.find((v) => v.id === vehicle.body.id)?.driverName === `${TAG} Driver`, "the vehicle shows its driver");
  ok((await call(teacher, "GET", "/transport")).status === 403, "a teacher cannot see transport management");
  ok((await call(transport, "DELETE", `/transport/vehicles/${vehicle.body.id}`)).status === 204, "a vehicle can be removed (routes keep running without it)");
  created.vehicles = [];
  ok((await call(transport, "DELETE", `/transport/routes/${route.body.id}`)).status === 204, "a route without riders can be removed");
  created.routes = [];

  console.log("Hostel");
  const hostel = (await call(warden, "GET", "/hostel")).body as { rooms: { id: string; type: string; capacity: number; block: string; number: string }[]; residents: { studentId: string; roomId: string }[] };
  const resident = hostel.residents[0];
  const residentGender = roster.find((s) => s.id === resident.studentId)?.gender;
  const free = hostel.rooms.find((r) => r.id !== resident.roomId && r.type === (residentGender === "FEMALE" ? "GIRLS" : "BOYS") && hostel.residents.filter((x) => x.roomId === r.id).length < r.capacity);
  const wrong = hostel.rooms.find((r) => r.type !== (residentGender === "FEMALE" ? "GIRLS" : "BOYS"));
  hostelRestore = { studentId: resident.studentId, roomId: resident.roomId };
  if (wrong) ok((await call(warden, "POST", "/hostel/allocations", { studentId: resident.studentId, roomId: wrong.id })).status === 400, "boys and girls rooms are kept apart");
  if (free) {
    ok((await call(warden, "POST", "/hostel/allocations", { studentId: resident.studentId, roomId: free.id })).status === 201, "the warden moves a resident to another room");
    const after = (await call(warden, "GET", "/hostel")).body as { residents: { studentId: string; roomId: string }[] };
    ok(after.residents.filter((r) => r.studentId === resident.studentId).length === 1 && after.residents.find((r) => r.studentId === resident.studentId)?.roomId === free.id, "a student lives in one room at a time");
  }
  const pass1 = await call(warden, "POST", "/hostel/outpasses", { studentId: resident.studentId, fromDate: day(3), toDate: day(5), reason: TAG });
  if (pass1.body?.id) created.outpasses.push(pass1.body.id);
  ok(pass1.status === 201 && pass1.body.status === "PENDING", "the warden records an outpass request", pass1.body);
  ok((await call(warden, "PATCH", `/hostel/outpasses/${pass1.body.id}`, { status: "RETURNED" })).status === 409, "a pending pass cannot be marked returned");
  ok((await call(warden, "PATCH", `/hostel/outpasses/${pass1.body.id}`, { status: "APPROVED" })).status === 200, "the warden approves it");
  ok((await call(teacher, "PATCH", `/hostel/outpasses/${pass1.body.id}`, { status: "RETURNED" })).status === 403, "a teacher cannot change outpasses");
  const nonResident = roster.find((s) => !hostel.residents.some((r) => r.studentId === s.id))!;
  ok((await call(warden, "POST", "/hostel/outpasses", { studentId: nonResident.id, fromDate: day(1), toDate: day(2), reason: "x" })).status === 400, "only residents get outpasses");
}

async function cleanup() {
  await withSystem(async (tx) => {
    await tx.bookLoan.deleteMany({ where: { book: { title: TAG } } });
    await tx.book.deleteMany({ where: { title: TAG } });
    await tx.stockMovement.deleteMany({ where: { item: { name: TAG } } });
    await tx.inventoryItem.deleteMany({ where: { name: TAG } });
    const routes = await tx.transportRoute.findMany({ where: { id: { in: created.routes } }, select: { id: true } });
    await tx.routeStop.deleteMany({ where: { routeId: { in: routes.map((r) => r.id) } } });
    await tx.transportRoute.deleteMany({ where: { id: { in: routes.map((r) => r.id) } } });
    await tx.vehicle.deleteMany({ where: { id: { in: created.vehicles } } });
    await tx.staff.deleteMany({ where: { name: `${TAG} Driver` } });
    await tx.outpass.deleteMany({ where: { reason: TAG } });
    if (hostelRestore) {
      // undo the move: drop allocations made today and reopen the original one
      const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      await tx.hostelAllocation.deleteMany({ where: { studentId: hostelRestore.studentId, fromDate: today } });
      const original = await tx.hostelAllocation.findFirst({ where: { studentId: hostelRestore.studentId, roomId: hostelRestore.roomId ?? undefined }, orderBy: { fromDate: 'desc' } });
      if (original) await tx.hostelAllocation.update({ where: { id: original.id }, data: { toDate: null } });
    }
  });
}

main()
  .catch((e) => {
    fail++;
    console.error(e);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    server.close();
    await prisma.$disconnect();
  });
