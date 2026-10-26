/**
 * Procurement API end-to-end, against the "greenwood" demo organization (npm run import:frontend):
 *   npm run test:procurement
 * Runs the whole flow over HTTP as each role, checks the guards, then removes everything it created.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";

const ORG = "greenwood";
const PASSWORD = "Demo@1234";
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
async function login(username: string, password = PASSWORD) {
  const r = await call(null, "POST", "/auth/login", { organization: ORG, username, password });
  if (r.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

const created = { indents: [] as string[], vendorId: "", chairmanId: "", items: [] as string[], issuedItem: "", issuedQty: 0 };

async function main() {
  const org = await withSystem((tx) => tx.organization.findUnique({ where: { subdomain: ORG }, select: { id: true } }));
  if (!org) throw new Error(`Organization "${ORG}" not found — run npm run import:frontend first.`);

  const teacher = await login("T002"); // Ms. Priya Sharma, Science (no HOD)
  const mathsHod = await login("T001"); // Mr. Rajesh Kumar, Mathematics HOD
  const store = await login("inventory");
  const principal = await login("principal");
  const accountant = await login("accountant");
  const admin = await login("admin");

  // A chairman for management approvals (removed at the end)
  const ch = await call(admin, "POST", "/users", { username: `chairman.test.${Date.now()}`, name: "Test Chairman", password: "Chairman123", memberships: [{ roleCode: "GROUP_OWNER", scopeType: "ORG" }] });
  created.chairmanId = ch.body.id;
  await withSystem((tx) => tx.user.update({ where: { id: ch.body.id }, data: { mustChangePassword: false } }));
  const chairman = await login(ch.body.username, "Chairman123");

  console.log("Raise and route");
  const stockItem = await withSystem((tx) => tx.inventoryItem.findFirstOrThrow({ where: { organizationId: org.id, quantity: { gte: 5 } }, select: { id: true, name: true, quantity: true } }));
  const r1 = await call(teacher, "POST", "/procurement/indents", {
    location: "Chemistry Lab", purpose: "API test", neededBy: "2026-12-01",
    lines: [{ name: "Beaker 250 ml (API test)", qty: 20, unit: "pcs", estRate: 60 }, { name: stockItem.name, qty: 2, unit: "pcs", estRate: 100, inventoryItemId: stockItem.id }],
  });
  const ind = r1.body;
  created.indents.push(ind.id);
  ok(r1.status === 201 && ind.status === "PENDING_STORE" && ind.events.some((e: { action: string }) => e.action === "HOD step skipped"), "Science indent skips the HOD (no HOD in Science)", r1.body);

  const r2 = await call(teacher, "POST", "/procurement/indents", { department: "Mathematics", location: "Maths Lab", purpose: "API test HOD", neededBy: "2026-12-01", lines: [{ name: "Graph paper", qty: 5, unit: "packs", estRate: 80 }] });
  created.indents.push(r2.body.id);
  ok(r2.body.department === "Science", "department comes from the teacher's staff record, not the request");
  ok(/^PR\//.test(ind.no), "requisitions are numbered PR/yy-yy/nnnn", ind.no);

  const sr = await call(store, "POST", "/procurement/indents", { department: "Store", location: "Main store", purpose: "API test reorder", neededBy: "2026-12-01", lines: [{ name: stockItem.name, qty: 5, unit: "pcs", estRate: 100, inventoryItemId: stockItem.id }] });
  created.indents.push(sr.body.id);
  ok(sr.status === 201 && sr.body.status === "PENDING_STORE" && sr.body.events[0]?.role === "STORE", "the store raises its own PR (reorder)", sr.body);
  ok((await call(store, "POST", `/procurement/indents/${sr.body.id}/store-check`, { lines: [{ issue: 2, estRate: 100 }] })).status === 400, "a reorder PR cannot be issued from the stock it replenishes");

  ok((await call(principal, "POST", `/procurement/indents/${ind.id}/principal`, { approve: true })).status === 409, "principal cannot approve before the store check");
  ok((await call(teacher, "POST", `/procurement/indents/${ind.id}/store-check`, { lines: [] })).status === 403, "a teacher cannot do the store check");
  ok((await call(mathsHod, "POST", `/procurement/indents/${ind.id}/hod`, { approve: true })).status === 403, "the Maths HOD cannot decide a Science indent");

  const sc = await call(store, "POST", `/procurement/indents/${ind.id}/store-check`, { lines: [{ issue: 0, estRate: 60, category: "Lab Equipment" }, { issue: 2, estRate: 100 }] });
  created.issuedItem = stockItem.id;
  created.issuedQty = 2;
  const after = await withSystem((tx) => tx.inventoryItem.findUniqueOrThrow({ where: { id: stockItem.id }, select: { quantity: true } }));
  ok(sc.body.status === "PENDING_PRINCIPAL" && after.quantity === stockItem.quantity - 2, "store issued 2 from stock and sent the rest for approval", { status: sc.body.status, after });

  const pr = await call(principal, "POST", `/procurement/indents/${ind.id}/principal`, { approve: true });
  ok(pr.body.status === "APPROVED_FOR_PURCHASE", "₹1,200 is within the principal's limit → approved for purchase", pr.body.status);
  ok((await call(chairman, "POST", `/procurement/indents/${ind.id}/management`, { approve: true })).status === 409, "management step is not needed for this one");

  console.log("Vendor, quotation, purchase order");
  const v = await call(store, "POST", "/procurement/vendors", { name: `API Test Lab Supplies ${Date.now()}`, gstin: "09AAKFL1234M1Z5", pan: "AAKFL1234M", bank: { bankName: "HDFC Bank", accountNo: "50200012345678", ifsc: "HDFC0000123" }, tdsSection: "194C" });
  created.vendorId = v.body.id;
  ok(v.status === 201 && v.body.bank?.accountLast4 === "5678" && !JSON.stringify(v.body).includes("50200012345678"), "vendor saved; bank account returned only as last 4 digits", v.body);
  const stored = await withSystem((tx) => tx.vendor.findUniqueOrThrow({ where: { id: v.body.id }, select: { bankAccount: true } }));
  ok(!!stored.bankAccount?.startsWith("v1:"), "bank account is encrypted in the database");
  ok((await call(store, "POST", "/procurement/vendors", { name: "Bad GSTIN Co", gstin: "12345" })).status === 400, "a wrong GSTIN is refused");

  const q = await call(store, "POST", `/procurement/indents/${ind.id}/quotations`, { vendorId: v.body.id, gstPercent: 12, deliveryDays: 5, validTill: "2026-12-31", lines: [{ lineNo: 0, rate: 55 }] });
  ok(q.status === 201, "quotation saved", q.body);
  const po = await call(store, "POST", `/procurement/indents/${ind.id}/purchase-order`, { quotationId: q.body.id });
  ok(po.status === 201 && /^PO\//.test(po.body.no), "purchase order raised", po.body);
  const poRow = await withSystem((tx) => tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.body.id }, include: { lines: true } }));
  ok(poRow.lines.length === 1 && poRow.lines[0].qty === 20 && Number(poRow.lines[0].rate) === 55, "PO holds only what was to be bought, at the quoted rate");

  console.log("Goods receipt and hand-over");
  ok((await call(store, "POST", `/procurement/purchase-orders/${po.body.id}/receipts`, { checkedBy: "Ms. Priya Sharma", challanNo: "DC-1", lines: [{ lineNo: 0, received: 20, accepted: 18 }] })).status === 400, "rejecting items without a reason is refused");
  const grn = await call(store, "POST", `/procurement/purchase-orders/${po.body.id}/receipts`, { checkedBy: "Ms. Priya Sharma", challanNo: "DC-1", lines: [{ lineNo: 0, received: 20, accepted: 18, rejectedReason: "2 cracked" }] });
  ok(grn.status === 201 && /^GRN\//.test(grn.body.no), "goods receipt saved", grn.body);
  const line = await withSystem((tx) => tx.indentLine.findFirstOrThrow({ where: { indentId: ind.id, lineNo: 0 }, select: { inventoryItemId: true } }));
  created.items.push(line.inventoryItemId!);
  const newItem = await withSystem((tx) => tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId! }, select: { quantity: true } }));
  ok(newItem.quantity === 18, "18 accepted beakers are in stock as a new inventory item");
  const iss = await call(store, "POST", `/procurement/indents/${ind.id}/issue`);
  const afterIssue = await withSystem((tx) => tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId! }, select: { quantity: true } }));
  ok(iss.body.status === "COMPLETED" && afterIssue.quantity === 0, "handed over to the teacher; indent completed", iss.body.status);

  console.log("Bill and payment");
  ok((await call(store, "POST", "/payables/bills", { poId: po.body.id, billNo: "X", billDate: "2026-10-22", subtotal: 990, gst: 118.8 })).status === 403, "the store cannot enter vendor bills");
  const wrong = await call(accountant, "POST", "/payables/bills", { poId: po.body.id, billNo: "API-WRONG-1", billDate: "2026-10-22", subtotal: 1100, gst: 132 });
  ok(wrong.body.status === "MISMATCH" && wrong.body.expected === 1108.8, "a bill for 20 (only 18 accepted) is flagged as a mismatch", wrong.body);
  ok((await call(accountant, "POST", `/payables/bills/${wrong.body.id}/pay`, { mode: "NEFT", reference: "UTR1", paidOn: "2026-10-22" })).status === 409, "a mismatched bill cannot be paid");
  await call(accountant, "POST", `/payables/bills/${wrong.body.id}/decision`, { action: "hold", note: "Billed for rejected items" });
  const right = await call(accountant, "POST", "/payables/bills", { poId: po.body.id, billNo: "API-OK-1", billDate: "2026-10-22", subtotal: 990, gst: 118.8 });
  ok(right.body.status === "MATCHED", "the corrected bill (18 × ₹55 + 12% GST) matches", right.body);
  const pay = await call(accountant, "POST", `/payables/bills/${right.body.id}/pay`, { mode: "NEFT", reference: "UTR123456", paidOn: "2026-10-22" });
  ok(pay.status === 201 && pay.body.tds === 0 && pay.body.net === 1108.8 && !!pay.body.expenseId, "paid ₹1,108.80 (no TDS below ₹30,000) and booked as an expense", pay.body);
  ok((await call(accountant, "POST", `/payables/bills/${right.body.id}/pay`, { mode: "NEFT", reference: "UTR2", paidOn: "2026-10-22" })).status === 409, "a bill cannot be paid twice");
  const storePo = (await call(store, "GET", "/procurement/purchase-orders")).body.find((p: { id: string }) => p.id === po.body.id);
  ok(storePo?.bills?.length === 2 && storePo.bills.some((b: { status: string; paidOn: string | null }) => b.status === "PAID" && b.paidOn), "the store sees the order's bills and payment from Accounts", storePo?.bills);

  console.log("Management approval and settings");
  const big = await call(teacher, "POST", "/procurement/indents", { location: "Biology Lab", purpose: "API test big", neededBy: "2026-12-01", lines: [{ name: "Microscope (API test)", qty: 2, unit: "pcs", estRate: 30000 }] });
  created.indents.push(big.body.id);
  await call(store, "POST", `/procurement/indents/${big.body.id}/store-check`, { lines: [{ issue: 0, estRate: 30000 }] });
  const bp = await call(principal, "POST", `/procurement/indents/${big.body.id}/principal`, { approve: true });
  ok(bp.body.status === "PENDING_MANAGEMENT", "₹60,000 goes to Management after the principal", bp.body.status);
  ok((await call(principal, "POST", `/procurement/indents/${big.body.id}/management`, { approve: true })).status === 403, "the principal cannot give the management approval");
  ok((await call(chairman, "POST", `/procurement/indents/${big.body.id}/management`, { approve: false })).status === 400, "rejecting needs a reason");
  const mg = await call(chairman, "POST", `/procurement/indents/${big.body.id}/management`, { approve: true, remark: "Board exams" });
  ok(mg.body.status === "APPROVED_FOR_PURCHASE", "chairman approved", mg.body.status);
  ok((await call(principal, "PUT", "/procurement/settings", { principalLimit: 999999 })).status === 403, "the principal cannot raise their own limit");

  console.log("Petty cash");
  const pc = await call(accountant, "GET", "/petty-cash");
  ok(pc.status === 200, "petty cash book opens");
  ok((await call(accountant, "POST", "/petty-cash/spend", { purpose: "Too big", paidTo: "Shop", category: "Other", amount: 5000, date: "2026-10-22" })).status === 400, "a spend above the voucher limit is refused");
  ok((await call(teacher, "GET", "/petty-cash")).status === 403, "teachers cannot see petty cash");

  console.log("Visibility");
  const mine = await call(teacher, "GET", "/procurement/indents");
  ok(mine.body.every((i: { requestedById: string }) => i.requestedById === mine.body[0].requestedById), "a teacher sees only their own indents");
  const all = await call(store, "GET", "/procurement/indents");
  ok(created.indents.every((id) => all.body.some((i: { id: string }) => i.id === id)), "the store sees the branch's indents");
}

async function cleanup() {
  await withSystem(async (tx) => {
    const indentIds = created.indents.filter(Boolean);
    const pos = await tx.purchaseOrder.findMany({ where: { indentId: { in: indentIds } }, select: { id: true } });
    const poIds = pos.map((p) => p.id);
    const bills = await tx.vendorBill.findMany({ where: { poId: { in: poIds } }, select: { id: true } });
    const payments = await tx.vendorPayment.findMany({ where: { billId: { in: bills.map((b) => b.id) } }, select: { id: true, expenseId: true } });
    await tx.vendorPayment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
    await tx.expense.deleteMany({ where: { id: { in: payments.map((p) => p.expenseId!).filter(Boolean) } } });
    await tx.vendorBill.deleteMany({ where: { id: { in: bills.map((b) => b.id) } } });
    const grns = await tx.goodsReceipt.findMany({ where: { poId: { in: poIds } }, select: { id: true } });
    await tx.goodsReceiptLine.deleteMany({ where: { grnId: { in: grns.map((g) => g.id) } } });
    await tx.goodsReceipt.deleteMany({ where: { id: { in: grns.map((g) => g.id) } } });
    await tx.purchaseOrderLine.deleteMany({ where: { poId: { in: poIds } } });
    await tx.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
    const quotes = await tx.quotation.findMany({ where: { indentId: { in: indentIds } }, select: { id: true } });
    await tx.quotationLine.deleteMany({ where: { quotationId: { in: quotes.map((q) => q.id) } } });
    await tx.quotation.deleteMany({ where: { id: { in: quotes.map((q) => q.id) } } });
    const nos = (await tx.indent.findMany({ where: { id: { in: indentIds } }, select: { no: true } })).map((i) => i.no);
    await tx.indentEvent.deleteMany({ where: { indentId: { in: indentIds } } });
    await tx.indentLine.deleteMany({ where: { indentId: { in: indentIds } } });
    await tx.indent.deleteMany({ where: { id: { in: indentIds } } });
    for (const no of nos) await tx.stockMovement.deleteMany({ where: { note: { contains: no } } });
    for (const itemId of created.items) {
      await tx.stockMovement.deleteMany({ where: { itemId } });
      await tx.inventoryItem.delete({ where: { id: itemId } }).catch(() => undefined);
    }
    if (created.issuedItem) await tx.inventoryItem.update({ where: { id: created.issuedItem }, data: { quantity: { increment: created.issuedQty } } });
    if (created.vendorId) await tx.vendor.delete({ where: { id: created.vendorId } });
    await tx.vendor.deleteMany({ where: { name: "Bad GSTIN Co" } });
    if (created.chairmanId) {
      await tx.refreshToken.deleteMany({ where: { userId: created.chairmanId } });
      await tx.membership.deleteMany({ where: { userId: created.chairmanId } });
      await tx.user.delete({ where: { id: created.chairmanId } });
    }
  }, { timeout: 60_000 });
  console.log("  (test data removed)");
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    server.close();
    await prisma.$disconnect();
  });
