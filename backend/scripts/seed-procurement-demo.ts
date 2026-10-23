/**
 * Demo purchasing data for the "greenwood" organization, created through the real API so every
 * record follows the flow (indent → store → approvals → quotations → PO → GRN → bill):
 *   npm run seed:procurement
 * Runs only when the organization has no indents yet.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";

const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}
async function login(username: string) {
  const res = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organization: "greenwood", username, password: "Demo@1234" }) });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${username}: ${JSON.stringify(data)}`);
  return data.accessToken as string;
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const org = await withSystem((tx) => tx.organization.findUnique({ where: { subdomain: "greenwood" }, select: { id: true } }));
  if (!org) throw new Error('Organization "greenwood" not found — run npm run import:frontend first.');
  if (await withSystem((tx) => tx.indent.count({ where: { organizationId: org.id } }))) {
    console.log("Purchasing data already exists — nothing to do.");
    return;
  }

  const store = await login("inventory");
  const principal = await login("principal");
  const accountant = await login("accountant");
  const priya = await login("T002"); // Science (no HOD)
  const rajesh = await login("T001"); // Mathematics HOD
  const vikram = await login("T005"); // Computer Science HOD
  const deepa = await login("T006"); // Physical Education

  // Management approver (chairman) for purchases above the principal's limit
  const admin = await login("admin");
  const users = await call(admin, "GET", "/users?search=chairman&pageSize=5");
  let chairman: string;
  if (users.items.some((u: { username: string }) => u.username === "chairman")) chairman = await login("chairman");
  else {
    const c = await call(admin, "POST", "/users", { username: "chairman", name: "Shri Alok Narayan", password: "Demo@1234", memberships: [{ roleCode: "GROUP_OWNER", scopeType: "ORG" }] });
    await withSystem((tx) => tx.user.update({ where: { id: c.id }, data: { mustChangePassword: false } }));
    chairman = await login("chairman");
  }

  const vendors: Record<string, string> = {};
  for (const v of [
    { key: "lab", name: "Lab Mart Scientific", category: "Lab supplies", gstin: "09AAKFL1234M1Z5", pan: "AAKFL1234M", phone: "+91 98390 11122", email: "sales@labmart.example.in", address: "Aminabad, Lucknow", bank: { bankName: "HDFC Bank", accountNo: "50200012345678", ifsc: "HDFC0000123" } },
    { key: "sci", name: "Scientific Instruments Co.", category: "Lab equipment", gstin: "09AAECS5678K1Z2", pan: "AAECS5678K", phone: "+91 94150 33344", email: "orders@sicoindia.example.in", address: "Hazratganj, Lucknow", bank: { bankName: "State Bank of India", accountNo: "38912345678", ifsc: "SBIN0001234" } },
    { key: "gupta", name: "Gupta Stationers", category: "Stationery", gstin: "09ABCPG4321H1Z9", pan: "ABCPG4321H", phone: "+91 90000 12345", email: "gupta.stationers@example.in", address: "Nishatganj, Lucknow", bank: { bankName: "Punjab National Bank", accountNo: "0123000100456789", ifsc: "PUNB0012300" }, isIndividual: true },
    { key: "sports", name: "Sports Hub India", category: "Sports equipment", gstin: "09AAJFS9876Q1Z1", pan: "AAJFS9876Q", phone: "+91 99560 77788", email: "hello@sportshub.example.in", address: "Alambagh, Lucknow", bank: { bankName: "ICICI Bank", accountNo: "123405001234", ifsc: "ICIC0001234" } },
    { key: "tech", name: "Techno Computers", category: "Computers & IT", gstin: "09AAGFT2468L1Z7", pan: "AAGFT2468L", phone: "+91 93350 22331", email: "support@technocomputers.example.in", address: "Gomti Nagar, Lucknow", bank: { bankName: "Axis Bank", accountNo: "918020012345678", ifsc: "UTIB0000123" } },
  ]) {
    const { key, ...body } = v;
    vendors[key] = (await call(store, "POST", "/procurement/vendors", { tdsSection: "194C", ...body })).id;
  }

  const raise = (token: string, location: string, purpose: string, lines: { name: string; qty: number; unit: string; estRate: number }[], priority = "NORMAL", neededIn = 10) =>
    call(token, "POST", "/procurement/indents", { location, purpose, priority, neededBy: day(neededIn), lines });
  const storeCheck = (id: string, lines: { estRate: number; category: string }[]) =>
    call(store, "POST", `/procurement/indents/${id}/store-check`, { lines: lines.map((l) => ({ issue: 0, ...l })), remark: "Not in stock" });
  const quote = (id: string, vendor: string, rates: number[], deliveryDays = 5, notes?: string) =>
    call(store, "POST", `/procurement/indents/${id}/quotations`, { vendorId: vendors[vendor], gstPercent: 12, deliveryDays, validTill: day(20), notes, lines: rates.map((rate, lineNo) => ({ lineNo, rate })) });

  // 1. Waiting at the store
  await raise(priya, "Chemistry Lab", "Class 11 practicals — titration and salt analysis", [
    { name: "Hydrochloric acid (500 ml)", qty: 6, unit: "bottles", estRate: 180 },
    { name: "Test tubes (borosilicate)", qty: 60, unit: "pcs", estRate: 15 },
    { name: "Litmus paper (blue & red)", qty: 20, unit: "packs", estRate: 40 },
  ], "URGENT", 7);

  // 2. Waiting for the principal
  const keyboards = await raise(vikram, "Computer Lab 2", "Replace broken keyboards", [{ name: "USB keyboard", qty: 10, unit: "pcs", estRate: 650 }], "NORMAL", 14);
  await storeCheck(keyboards.id, [{ estRate: 650, category: "Computers" }]);

  // 3. Above the principal's limit — waiting for management
  const microscopes = await raise(priya, "Biology Lab", "Two more compound microscopes for Class 12 practical exams", [{ name: "Compound microscope (1000x, LED)", qty: 2, unit: "pcs", estRate: 28500 }], "NORMAL", 30);
  await storeCheck(microscopes.id, [{ estRate: 28500, category: "Lab Equipment" }]);
  await call(principal, "POST", `/procurement/indents/${microscopes.id}/principal`, { approve: true, remark: "Needed for board practicals." });

  // 4. Approved — quotations being collected
  const geometry = await raise(rajesh, "Maths Lab", "Geometry boxes for the Maths lab kit", [{ name: "Geometry box (student)", qty: 40, unit: "pcs", estRate: 190 }]);
  await storeCheck(geometry.id, [{ estRate: 190, category: "Stationery" }]);
  await call(principal, "POST", `/procurement/indents/${geometry.id}/principal`, { approve: true, remark: "" });
  await quote(geometry.id, "gupta", [175], 3, "Camlin brand");
  await quote(geometry.id, "lab", [205], 5, "Includes protractor + compass");

  // 5. Ordered from the vendor
  const sports = await raise(deepa, "Sports Room", "Inter-house football tournament", [
    { name: "Football (size 5)", qty: 12, unit: "pcs", estRate: 700 },
    { name: "Training cones", qty: 30, unit: "pcs", estRate: 60 },
  ], "URGENT", 3);
  await storeCheck(sports.id, [{ estRate: 700, category: "Sports Equipment" }, { estRate: 60, category: "Sports Equipment" }]);
  await call(principal, "POST", `/procurement/indents/${sports.id}/principal`, { approve: true, remark: "" });
  const q1 = await quote(sports.id, "sports", [640, 55], 7, "Nivia footballs");
  await quote(sports.id, "gupta", [690, 60], 4);
  await quote(sports.id, "lab", [720, 58], 6);
  await call(store, "POST", `/procurement/indents/${sports.id}/purchase-order`, { quotationId: q1.id, note: "" });

  // 6. Delivered and billed
  const burettes = await raise(priya, "Chemistry Lab", "Burettes broken during practicals", [{ name: "Burette 50 ml (with stopcock)", qty: 10, unit: "pcs", estRate: 420 }]);
  await storeCheck(burettes.id, [{ estRate: 420, category: "Lab Equipment" }]);
  await call(principal, "POST", `/procurement/indents/${burettes.id}/principal`, { approve: true, remark: "" });
  const q2 = await quote(burettes.id, "lab", [395], 7);
  const po = await call(store, "POST", `/procurement/indents/${burettes.id}/purchase-order`, { quotationId: q2.id, note: "Below ₹5,000 — one quotation is enough" });
  await call(store, "POST", `/procurement/purchase-orders/${po.id}/receipts`, { checkedBy: "Ms. Priya Sharma", challanNo: "LM/DC/4471", lines: [{ lineNo: 0, received: 10, accepted: 10 }] });
  await call(store, "POST", `/procurement/indents/${burettes.id}/issue`, {});
  await call(accountant, "POST", "/payables/bills", { poId: po.id, billNo: "LMS/2026/1187", billDate: day(-1), subtotal: 3950, gst: 474 });

  // Petty cash: opening float and a few small spends
  await call(accountant, "POST", "/petty-cash/top-up", {});
  for (const [purpose, paidTo, category, amount, d] of [
    ["Chalk and dusters for Block A", "Local shop", "Stationery", 640, -12],
    ["Courier — CBSE documents", "DTDC", "Other", 350, -7],
    ["First-aid refills", "Apollo Pharmacy", "Other", 1180, -3],
  ] as const) await call(accountant, "POST", "/petty-cash/spend", { purpose, paidTo, category, amount, date: day(d) });

  void chairman;
  console.log("Purchasing demo data created: 5 vendors, 6 indents (store → management → quotations → ordered → delivered & billed), petty cash.");
  console.log('Management approvals: sign in as "chairman" (password Demo@1234).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.close();
    await prisma.$disconnect();
  });
