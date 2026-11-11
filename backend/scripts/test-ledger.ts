/**
 * General ledger API checks against the "greenwood" demo organization:
 *   npm run test:ledger
 * Requires migrations 013–014 and the refreshed demo permissions. Test accounts and vouchers are removed.
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma, withSystem } from "../src/db/prisma.js";

const ORG = "greenwood";
let pass = 0;
let fail = 0;
const ok = (condition: boolean, label: string, extra?: unknown) => {
  condition ? pass++ : fail++;
  console.log(`${condition ? "  ✓" : "  ✗"} ${label}${!condition && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
async function call(token: string | null, method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function login(username: string) {
  const response = await call(null, "POST", "/auth/login", { organization: ORG, username, password: "Demo@1234" });
  if (response.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(response.body)}`);
  return response.body.accessToken as string;
}

const tag = Date.now().toString(36);
const accountIds: string[] = [];
const journalIds: string[] = [];

async function main() {
  const accountant = await login("accountant");
  const teacher = await login("T002");
  const me = await call(accountant, "GET", "/me");
  const branch = me.body.branches.find((item: { permissions: string[] }) => item.permissions.includes("accounting.manage"));
  if (!branch) throw new Error("The accountant has no branch with accounting.manage.");

  console.log("Chart of accounts & permissions");
  const chart = await call(accountant, "GET", "/accounts/ledger/accounts");
  ok(chart.status === 200 && Array.isArray(chart.body), "accountant can read the branch chart");
  ok((await call(teacher, "GET", "/accounts/ledger/accounts")).status === 403, "teacher cannot read the ledger");

  console.log("Finance operations access");
  for (const [label, path] of [
    ["bank accounts", "/accounts/banking/accounts"],
    ["department budgets", "/accounts/budgets"],
    ["restricted grants", "/accounts/grants"],
  ] as const) {
    const allowed = await call(accountant, "GET", path);
    const denied = await call(teacher, "GET", path);
    ok(allowed.status === 200 && Array.isArray(allowed.body.budgets ?? allowed.body), `accountant can read ${label}`);
    ok(denied.status === 403, `teacher cannot read ${label}`);
  }

  const cash = await call(accountant, "POST", "/accounts/ledger/accounts", {
    branchId: branch.id, code: `${tag}A`, name: "Ledger test cash", category: "ASSET",
  });
  if (cash.body?.id) accountIds.push(cash.body.id);
  const fund = await call(accountant, "POST", "/accounts/ledger/accounts", {
    branchId: branch.id, code: `${tag}E`, name: "Ledger test fund", category: "EQUITY",
  });
  if (fund.body?.id) accountIds.push(fund.body.id);
  ok(cash.status === 201 && fund.status === 201, "accountant can create branch-scoped accounts", { cash: cash.status, fund: fund.status });

  console.log("Balanced journal vouchers");
  const today = new Date().toISOString().slice(0, 10);
  const unbalanced = await call(accountant, "POST", "/accounts/ledger/journals", {
    branchId: branch.id, entryDate: today, description: tag,
    lines: [{ accountId: cash.body.id, debit: 100, credit: 0 }, { accountId: fund.body.id, debit: 0, credit: 99 }],
  });
  ok(unbalanced.status === 400, "unbalanced vouchers are rejected");

  const posted = await call(accountant, "POST", "/accounts/ledger/journals", {
    branchId: branch.id, entryDate: today, description: tag,
    lines: [
      { accountId: cash.body.id, description: "Test debit", debit: 100, credit: 0 },
      { accountId: fund.body.id, description: "Test credit", debit: 0, credit: 100 },
    ],
  });
  if (posted.body?.id) journalIds.push(posted.body.id);
  ok(posted.status === 201 && posted.body.debitTotal === 100 && posted.body.lines.length === 2, "balanced vouchers post with matching debit and credit", posted.body);
  ok((await call(teacher, "POST", "/accounts/ledger/journals", {
    branchId: branch.id, entryDate: today, description: tag,
    lines: [{ accountId: cash.body.id, debit: 100, credit: 0 }, { accountId: fund.body.id, debit: 0, credit: 100 }],
  })).status === 403, "teacher cannot post vouchers");

  const report = await call(accountant, "GET", `/accounts/ledger/reports?from=1970-01-01&to=${today}`);
  const totals = report.body?.trialBalanceTotals;
  ok(report.status === 200 && totals?.debits === totals?.credits, "trial balance remains balanced", totals);
  const balanceSheet = report.body?.balanceSheet;
  ok(
    report.status === 200 && Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilities - balanceSheet.totalEquity) < 0.01,
    "balance sheet balances including accumulated earnings",
    balanceSheet,
  );
}

async function cleanup() {
  await withSystem(async (tx) => {
    if (journalIds.length) {
      await tx.journalLine.deleteMany({ where: { journalEntryId: { in: journalIds } } });
      await tx.journalEntry.deleteMany({ where: { id: { in: journalIds } } });
    }
    if (accountIds.length) await tx.ledgerAccount.deleteMany({ where: { id: { in: accountIds } } });
    // AuditLog rows are immutable (migration 019) and stay as history. Deleting them used to throw and
    // roll the whole cleanup back, leaving the test accounts and vouchers in the ledger.
  });
}

main()
  .catch((error) => {
    fail++;
    console.error(error);
  })
  .finally(async () => {
    await cleanup().catch((error) => console.error("cleanup failed:", error));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    server.close();
    await prisma.$disconnect();
  });
