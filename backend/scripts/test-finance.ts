/**
 * Fees, expenses, leave and payroll over HTTP, against the "greenwood" demo organization:
 *   npm run test:finance
 * Checks the money rules and who may do what; everything it creates is removed at the end.
 * Online fee payments by parents need DEMO_PAYMENTS=true (the test skips them otherwise).
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma, withSystem } from "../src/db/prisma.js";

const ORG = "greenwood";
let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, extra?: unknown) => {
  c ? pass++ : fail++;
  console.log(`${c ? "  ✓" : "  ✗"} ${label}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
async function call(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function login(username: string) {
  const r = await call(null, "POST", "/auth/login", { organization: ORG, username, password: "Demo@1234" });
  if (r.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

const TAG = `fin-test-${Date.now()}`;
const created = { payments: [] as string[], expenses: [] as string[], leaves: [] as string[], payrollRun: "" };

type Account = { studentId: string; annualFee: number; concessionPercent: number; total: number; installments: { no: number; dueDate: string; amount: number }[] };

async function main() {
  const accountant = await login("accountant");
  const principal = await login("principal");
  const teacher = await login("T002");
  const hr = await login("hr");
  const parent = await login("9876511111");
  const student = await login("ADM-2025-1001");
  const aliceId: string = (await call(student, "GET", "/me")).body.students[0].id;

  console.log("Fee structure & accounts");
  const structure = (await call(student, "GET", "/fees/structure")).body as { lateFeePerDay: number; grades: { gradeId: string; grade: string; annualAmount: number | null; installments: { percent: number }[] }[] };
  ok(structure.grades.some((g) => g.annualAmount && g.installments.length), "anyone in the school sees the fee structure", structure);
  const g10 = structure.grades.find((g) => g.grade === "Class 10")!;
  ok(Math.abs(g10.installments.reduce((a, i) => a + i.percent, 0) - 100) < 0.01, "installment percentages add up to 100 %");
  ok((await call(teacher, "PUT", `/fees/structure/${g10.gradeId}`, { annualAmount: 1 })).status === 403, "a teacher cannot change fees");
  ok((await call(accountant, "PUT", `/fees/structure/${g10.gradeId}`, { annualAmount: g10.annualAmount })).status === 200, "the accountant sets a grade's fee");

  const all = (await call(accountant, "GET", "/fees/accounts")).body as Account[];
  const mine = (await call(parent, "GET", "/fees/accounts")).body as Account[];
  ok(all.length > 20 && mine.length === 1 && mine[0].studentId === aliceId, "staff see every account, a parent only their child's", { all: all.length, mine: mine.length });
  ok((await call(teacher, "GET", "/fees/accounts")).status === 403, "a teacher cannot see fee accounts");
  const withConcession = all.find((a) => a.concessionPercent > 0);
  ok(!!withConcession && withConcession.total === Math.round((withConcession.annualFee * (100 - withConcession.concessionPercent)) / 100), "concessions reduce the annual fee", withConcession);
  ok(all.every((a) => a.installments.reduce((t, i) => t + i.amount, 0) === a.total), "installments always add up to the total (no rupee lost to rounding)");

  console.log("Payments");
  const payments = (await call(accountant, "GET", "/fees/payments")).body as { studentId: string; installmentNo: number }[];
  const unpaid = (a: Account) => a.installments.filter((i) => !payments.some((p) => p.studentId === a.studentId && p.installmentNo === i.no));
  const target = all.find((a) => a.studentId !== aliceId && unpaid(a).length)!;
  const inst = unpaid(target)[0];
  ok((await call(teacher, "POST", "/fees/payments", { studentId: target.studentId, installmentNo: inst.no, method: "CASH" })).status === 404, "a teacher cannot collect fees");
  const key = `${TAG}-1`;
  const paid = await call(accountant, "POST", "/fees/payments", { studentId: target.studentId, installmentNo: inst.no, method: "Cash" }, { "Idempotency-Key": key });
  if (paid.body?.id) created.payments.push(paid.body.id);
  const daysLate = Math.max(0, Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(inst.dueDate)) / 86_400_000));
  ok(paid.status === 201 && paid.body.amount === inst.amount && paid.body.lateFee === daysLate * structure.lateFeePerDay, "the accountant collects cash: amount and late fee come from the server", { body: paid.body, expectLate: daysLate * structure.lateFeePerDay });
  ok(/^[A-Z0-9-]+\/\d{2}\/\d{6}$/.test(paid.body.receiptNo), "a sequential receipt number is issued", paid.body.receiptNo);
  const retry = await call(accountant, "POST", "/fees/payments", { studentId: target.studentId, installmentNo: inst.no, method: "Cash" }, { "Idempotency-Key": key });
  ok(retry.status === 200 && retry.body.id === paid.body.id, "a retry with the same Idempotency-Key returns the same payment");
  ok((await call(accountant, "POST", "/fees/payments", { studentId: target.studentId, installmentNo: inst.no, method: "Cash" })).status === 409, "an installment cannot be paid twice");
  ok((await call(accountant, "POST", "/fees/payments", { studentId: target.studentId, installmentNo: 9, method: "Cash" })).status === 400, "an installment outside the plan is refused");

  const aliceAcc = all.find((a) => a.studentId === aliceId)!;
  const aliceDue = unpaid(aliceAcc)[0];
  ok((await call(parent, "POST", "/fees/payments", { studentId: target.studentId, installmentNo: unpaid(target)[1]?.no ?? 1, method: "UPI" })).status === 404, "a parent cannot pay for someone else's child");
  if (aliceDue) {
    ok((await call(parent, "POST", "/fees/payments", { studentId: aliceId, installmentNo: aliceDue.no, method: "CASH" })).status === (env.DEMO_PAYMENTS ? 400 : 403), "parents cannot record cash payments online");
    const online = await call(parent, "POST", "/fees/payments", { studentId: aliceId, installmentNo: aliceDue.no, method: "UPI" });
    if (env.DEMO_PAYMENTS) {
      if (online.body?.id) created.payments.push(online.body.id);
      ok(online.status === 201 && online.body.gatewayRef?.startsWith("DEMO-"), "with the demo gateway on, a parent pays online", online.body);
      ok((await call(student, "GET", "/fees/payments")).body.some((p: { id: string }) => p.id === online.body.id), "the student sees the payment");
    } else ok(online.status === 403 && online.body.code === "ONLINE_PAYMENT_UNAVAILABLE", "without a gateway, online payment is refused clearly", online.body);
  } else console.log("  (Alice has no unpaid installment — online payment checks skipped)");

  console.log("Expenses");
  const today = new Date().toISOString().slice(0, 10);
  const exp = await call(accountant, "POST", "/expenses", { date: today, category: "Stationery", description: TAG, amount: 1234.5, paidTo: "Test Vendor", method: "Bank Transfer" });
  if (exp.body?.id) created.expenses.push(exp.body.id);
  ok(exp.status === 201 && exp.body.method === "BANK_TRANSFER" && exp.body.amount === 1234.5, "the accountant records an expense", exp.body);
  ok((await call(teacher, "POST", "/expenses", { date: today, category: "Other", description: "x", amount: 1, method: "Cash" })).status === 403, "a teacher cannot record expenses");
  ok((await call(accountant, "POST", "/expenses", { date: "2099-01-01", category: "Other", description: "x", amount: 1, method: "Cash" })).status === 400, "future-dated expenses are refused");
  const listed = (await call(principal, "GET", "/expenses")).body as { id: string; fromPurchase: boolean }[];
  ok(listed.some((e) => e.id === exp.body.id), "the principal sees expenses (reports)");
  const purchase = listed.find((e) => e.fromPurchase);
  if (purchase) ok((await call(accountant, "DELETE", `/expenses/${purchase.id}`)).status === 400, "expenses booked by purchase payments cannot be deleted");
  ok((await call(accountant, "DELETE", `/expenses/${exp.body.id}`)).status === 204, "the accountant deletes an expense");
  created.expenses = [];

  console.log("Leave");
  const from = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 41 * 86_400_000).toISOString().slice(0, 10);
  const leave = await call(teacher, "POST", "/leaves", { type: "Casual", fromDate: from, toDate: to, reason: TAG });
  if (leave.body?.id) created.leaves.push(leave.body.id);
  ok(leave.status === 201 && leave.body.staffName === "Ms. Priya Sharma" && leave.body.status === "PENDING", "a teacher applies for leave", leave.body);
  ok((await call(teacher, "POST", "/leaves", { type: "Sick", fromDate: to, toDate: to, reason: "x" })).status === 409, "overlapping requests are refused");
  ok((await call(teacher, "POST", "/leaves", { type: "Sick", fromDate: to, toDate: from, reason: "x" })).status === 400, "end before start is refused");
  ok((await call(teacher, "PATCH", `/leaves/${leave.body.id}`, { status: "APPROVED" })).status === 403, "a teacher cannot approve leave");
  const own = (await call(teacher, "GET", "/leaves")).body as { staffName: string }[];
  ok(own.length > 0 && own.every((l) => l.staffName === "Ms. Priya Sharma"), "a teacher sees only their own requests");
  ok((await call(hr, "GET", "/leaves")).body.length > own.length, "HR sees everyone's requests");
  ok((await call(principal, "PATCH", `/leaves/${leave.body.id}`, { status: "APPROVED" })).body.status === "APPROVED", "the principal approves");
  ok((await call(principal, "PATCH", `/leaves/${leave.body.id}`, { status: "REJECTED" })).status === 409, "a decided request cannot be decided again");
  const staff = (await call(hr, "GET", "/staff?type=NON_TEACHING")).body as { id: string }[];
  const onBehalf = await call(hr, "POST", "/leaves", { staffId: staff[0].id, type: "Earned", fromDate: from, toDate: from, reason: TAG });
  if (onBehalf.body?.id) created.leaves.push(onBehalf.body.id);
  ok(onBehalf.status === 201, "HR files leave for a staff member", onBehalf.body);
  ok((await call(teacher, "POST", "/leaves", { staffId: staff[0].id, type: "Earned", fromDate: to, toDate: to, reason: "x" })).status === 403, "a teacher cannot file leave for someone else");

  console.log("Payroll");
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const runs = (await call(hr, "GET", "/payroll")).body as { month: string; status: string }[];
  ok(Array.isArray(runs), "HR sees payroll runs");
  ok((await call(teacher, "GET", "/payroll")).status === 403, "a teacher cannot see payroll");
  ok((await call(hr, "POST", "/payroll/2099-01/process", {})).status === 400, "future months cannot be processed");
  const existing = runs.find((r) => r.month === month);
  if (existing?.status === "PAID") {
    ok((await call(hr, "POST", `/payroll/${month}/process`, {})).status === 409, "a paid month cannot be processed again");
  } else {
    const run = await call(hr, "POST", `/payroll/${month}/process`, {});
    if (!existing && run.body?.id) created.payrollRun = run.body.id;
    ok(run.status === 200 && run.body.payslips > 10 && Math.abs(run.body.gross - run.body.net) > 0, "HR processes this month's payroll", run.body);
    const slips = ((await call(accountant, "GET", "/payroll")).body as { month: string; payslips: { name: string; gross: number; deductions: number; net: number }[] }[]).find((r) => r.month === month)!.payslips;
    ok(slips.every((p) => Math.abs(p.gross - p.deductions - p.net) < 0.01), "every payslip: net = gross − deductions");
    const priya = slips.find((p) => p.name === "Ms. Priya Sharma");
    ok(!!priya && priya.deductions > 200, "teachers' PF and professional tax are deducted", priya);
    if (!existing) {
      ok((await call(accountant, "POST", `/payroll/${month}/pay`, {})).body.status === "PAID", "the accountant marks salaries paid");
      ok((await call(hr, "POST", `/payroll/${month}/process`, {})).status === 409, "a paid month cannot be processed again");
    }
  }
}

async function cleanup() {
  await withSystem(async (tx) => {
    await tx.feePayment.deleteMany({ where: { id: { in: created.payments } } });
    await tx.expense.deleteMany({ where: { OR: [{ id: { in: created.expenses } }, { description: { startsWith: TAG } }] } });
    await tx.leaveRequest.deleteMany({ where: { OR: [{ id: { in: created.leaves } }, { reason: { startsWith: TAG } }] } });
    if (created.payrollRun) {
      await tx.payslip.deleteMany({ where: { payrollRunId: created.payrollRun } });
      await tx.payrollRun.delete({ where: { id: created.payrollRun } });
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
