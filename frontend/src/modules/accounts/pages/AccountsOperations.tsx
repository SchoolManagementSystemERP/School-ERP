import { useEffect, useState, type ChangeEvent } from "react";
import { Ban, Check, Download, FileSpreadsheet, Landmark, Link2, Plus, Printer, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { today } from "@/lib/dates";
import { canAny } from "@/store/auth";
import { downloadCsv } from "@/store/inventory";

type LedgerAccount = { id: string; code: string; name: string; category: string; isActive: boolean };
type BankAccount = {
  id: string; name: string; bankName: string; accountLast4: string; accountType: string;
  ledgerAccountId: string; ledgerCode: string; ledgerName: string; openingBalance: number; isActive: boolean;
};
type StatementLine = {
  id: string; bankAccountId: string; bankAccount: string; transactionDate: string; description: string;
  reference: string | null; direction: "CREDIT" | "DEBIT"; amount: number; status: string; matchedJournalLineId: string | null;
};
type SuggestedMatch = {
  journalLineId: string; entryNo: string; entryDate: string; description: string; sourceType: string;
  amount: number; direction: "CREDIT" | "DEBIT";
};
type Budget = {
  id: string; branchId: string; fiscalYear: string; department: string; category: string;
  allocated: number; spent: number; committed: number; available: number; hardStop: boolean;
};
type GrantTransaction = { id: string; date: string; kind: string; description: string; amount: number; sourceType: string | null };
type GrantFund = {
  id: string; code: string; name: string; donor: string; restriction: string; awarded: number; received: number;
  spent: number; unspent: number; startDate: string; endDate: string; status: string; transactions: GrantTransaction[];
};

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inr = (value: number) => money.format(value);
const financialYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
const emptyBank = { ledgerAccountId: "", name: "", bankName: "", accountLast4: "", accountType: "OPERATING", openingBalance: "0" };
const emptyGrant = { code: "", name: "", donor: "", restriction: "", awarded: "", received: "0", startDate: today(), endDate: today() };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(value.trim()); value = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  return rows;
}

function parseBankCsv(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("Choose a CSV with a header and at least one transaction.");
  const header = rows[0].map((cell) => cell.toLowerCase().replace(/[\s_-]+/g, ""));
  const col = (...names: string[]) => header.findIndex((key) => names.includes(key));
  const dateCol = col("date", "transactiondate", "valuedate");
  const descriptionCol = col("description", "narration", "details", "particulars");
  const referenceCol = col("reference", "ref", "referenceno", "chequeno");
  const directionCol = col("direction", "type", "drcr", "crdr");
  const debitCol = col("debit", "withdrawal", "withdrawals");
  const creditCol = col("credit", "deposit", "deposits");
  const amountCol = col("amount", "transactionamount");
  if (dateCol < 0 || descriptionCol < 0 || (directionCol < 0 && debitCol < 0 && creditCol < 0 && amountCol < 0)) {
    throw new Error("CSV headers must include date, description and direction/amount or debit and credit columns.");
  }
  const parsed = rows.slice(1).map((cells, index) => {
    const dateText = cells[dateCol] ?? "";
    const dateParts = dateText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    const transactionDate = dateParts
      ? `${dateParts[3]}-${dateParts[2].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}`
      : dateText;
    const debit = debitCol >= 0 ? Number((cells[debitCol] ?? "").replace(/[₹,\s]/g, "")) || 0 : 0;
    const credit = creditCol >= 0 ? Number((cells[creditCol] ?? "").replace(/[₹,\s]/g, "")) || 0 : 0;
    const amountText = amountCol >= 0 ? cells[amountCol] : "";
    const rawAmount = Number((amountText ?? "").replace(/[₹,\s]/g, ""));
    const directionText = directionCol >= 0 ? (cells[directionCol] ?? "").toUpperCase() : "";
    let direction: "CREDIT" | "DEBIT";
    let amount: number;
    if (credit > 0 && debit > 0) throw new Error(`Transaction row ${index + 2} has both debit and credit amounts.`);
    if (credit > 0) { direction = "CREDIT"; amount = credit; }
    else if (debit > 0) { direction = "DEBIT"; amount = debit; }
    else {
      direction = ["CR", "CREDIT", "DEPOSIT", "IN"].includes(directionText) ? "CREDIT" : "DEBIT";
      amount = Math.abs(rawAmount);
    }
    const [year, month, day] = transactionDate.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)
      || parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day
      || !(cells[descriptionCol] ?? "").trim() || !Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Transaction row ${index + 2} has an invalid date, description or amount.`);
    }
    return {
      transactionDate, description: cells[descriptionCol].slice(0, 300),
      ...(referenceCol >= 0 && cells[referenceCol] ? { reference: cells[referenceCol].slice(0, 100) } : {}),
      direction, amount: Math.round(amount * 100) / 100,
    };
  });
  if (parsed.length > 500) throw new Error("Import up to 500 statement lines at a time.");
  return parsed;
}

export function AccountsOperations() {
  const canManage = canAny("accounting.manage");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [statementLines, setStatementLines] = useState<StatementLine[]>([]);
  const [matches, setMatches] = useState<Record<string, SuggestedMatch[]>>({});
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [grants, setGrants] = useState<GrantFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankForm, setBankForm] = useState(emptyBank);
  const [budgetForm, setBudgetForm] = useState({ fiscalYear: financialYear(), department: "", category: "All", allocated: "", hardStop: true });
  const [grantForm, setGrantForm] = useState(emptyGrant);
  const [transactionGrant, setTransactionGrant] = useState("");
  const [grantTxn, setGrantTxn] = useState({ date: today(), kind: "EXPENSE", description: "", amount: "", category: "Research", method: "BANK_TRANSFER" });

  const loadBanking = async () => {
    const [nextAccounts, lines, nextLedger] = await Promise.all([
      api.get<BankAccount[]>("/accounts/banking/accounts"),
      api.get<StatementLine[]>("/accounts/banking/statement-lines?status=UNMATCHED"),
      api.get<LedgerAccount[]>("/accounts/ledger/accounts"),
    ]);
    setAccounts(nextAccounts);
    setStatementLines(lines);
    setLedgerAccounts(nextLedger.filter((account) => account.isActive && account.category === "ASSET"));
  };
  const loadBudgets = async (year = budgetForm.fiscalYear) => {
    const result = await api.get<{ budgets: Budget[] }>(`/accounts/budgets?fiscalYear=${encodeURIComponent(year)}`);
    setBudgets(result.budgets);
  };
  const loadGrants = async () => setGrants(await api.get<GrantFund[]>("/accounts/grants"));

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<BankAccount[]>("/accounts/banking/accounts"),
      api.get<StatementLine[]>("/accounts/banking/statement-lines?status=UNMATCHED"),
      api.get<LedgerAccount[]>("/accounts/ledger/accounts"),
      api.get<{ budgets: Budget[] }>(`/accounts/budgets?fiscalYear=${encodeURIComponent(financialYear())}`),
      api.get<GrantFund[]>("/accounts/grants"),
    ]).then(([nextAccounts, lines, nextLedger, budgetResult, nextGrants]) => {
      if (!active) return;
      setAccounts(nextAccounts);
      setStatementLines(lines);
      setLedgerAccounts(nextLedger.filter((account) => account.isActive && account.category === "ASSET"));
      setBudgets(budgetResult.budgets);
      setGrants(nextGrants);
    }).catch((error: unknown) => {
      if (active) toast.error(errorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const saveBankAccount = async () => {
    if (!bankForm.ledgerAccountId || !bankForm.name.trim() || !bankForm.bankName.trim() || !/^\d{4}$/.test(bankForm.accountLast4)) {
      toast.error("Enter a bank name, account name, last four digits and a ledger account.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/accounts/banking/accounts", { ...bankForm, openingBalance: Number(bankForm.openingBalance) || 0 });
      setBankForm(emptyBank);
      await loadBanking();
      toast.success("Bank account added");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  };

  const importStatement = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const selected = input.dataset.bankAccountId;
    input.value = "";
    if (!file) return;
    if (!selected) return;
    setSaving(true);
    try {
      const text = await file.text();
      const lines = parseBankCsv(text);
      const result = await api.post<{ imported: number; duplicates: number }>(`/accounts/banking/accounts/${selected}/import`, { lines });
      await loadBanking();
      toast.success(`${result.imported} statement lines imported${result.duplicates ? `; ${result.duplicates} duplicates skipped` : ""}`);
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  };

  const suggestMatches = async (lineId: string) => {
    try {
      const result = await api.get<SuggestedMatch[]>(`/accounts/banking/statement-lines/${lineId}/matches`);
      setMatches((current) => ({ ...current, [lineId]: result }));
      if (!result.length) toast.info("No matching ledger entries found within three days.");
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const matchLine = async (lineId: string, journalLineId: string) => {
    try {
      await api.post(`/accounts/banking/statement-lines/${lineId}/match`, { journalLineId });
      await loadBanking();
      toast.success("Statement line reconciled");
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const ignoreLine = async (lineId: string) => {
    const reason = window.prompt("Why should this statement line be ignored?");
    if (!reason?.trim()) return;
    try {
      await api.post(`/accounts/banking/statement-lines/${lineId}/ignore`, { reason });
      await loadBanking();
      toast.success("Statement line ignored");
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const saveBudget = async () => {
    const allocated = Number(budgetForm.allocated);
    if (!budgetForm.department.trim() || !budgetForm.category.trim() || !Number.isFinite(allocated) || allocated < 0) {
      toast.error("Enter a department, budget category and valid allocation.");
      return;
    }
    setSaving(true);
    try {
      await api.put("/accounts/budgets", { ...budgetForm, allocated });
      await loadBudgets();
      setBudgetForm((current) => ({ ...current, allocated: "" }));
      toast.success("Department budget saved");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  };

  const saveGrant = async () => {
    const awarded = Number(grantForm.awarded);
    const received = Number(grantForm.received);
    if (!grantForm.code.trim() || !grantForm.name.trim() || !Number.isFinite(awarded) || awarded <= 0 || !Number.isFinite(received) || received < 0) {
      toast.error("Enter the grant details, a positive award and a valid received amount.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/accounts/grants", { ...grantForm, awarded, received });
      await loadGrants();
      setGrantForm(emptyGrant);
      toast.success("Restricted grant created");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  };

  const saveGrantTransaction = async () => {
    if (!transactionGrant) return;
    const value = Number(grantTxn.amount);
    if (!grantTxn.description.trim() || !Number.isFinite(value) || value <= 0) {
      toast.error("Enter a transaction description and positive amount.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/accounts/grants/${transactionGrant}/transactions`, {
        ...grantTxn, amount: value,
        ...(grantTxn.kind === "EXPENSE" ? {} : { category: undefined, method: undefined }),
      });
      await loadGrants();
      setGrantTxn((current) => ({ ...current, description: "", amount: "" }));
      toast.success("Grant transaction recorded");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  };

  const exportUtilization = async (fund: GrantFund) => {
    try {
      const report = await api.get<{
        code: string; name: string; donor: string; restriction: string; awarded: number; received: number; utilized: number;
        transactions: { date: string; kind: string; description: string; amount: number; sourceType: string | null }[];
      }>(`/accounts/grants/${fund.id}/utilization`);
      downloadCsv(`grant-utilization-${fund.code}.csv`,
        ["Grant", "Donor", "Restriction", "Awarded", "Received", "Utilized", "Date", "Type", "Description", "Amount", "Source"],
        report.transactions.map((transaction) => [
          report.name, report.donor, report.restriction, report.awarded, report.received, report.utilized,
          transaction.date, transaction.kind, transaction.description, transaction.amount, transaction.sourceType ?? "",
        ]));
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const printUtilizationCertificate = async (fund: GrantFund) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Allow pop-ups to generate the utilization certificate.");
      return;
    }
    try {
      const report = await api.get<{
        code: string; name: string; donor: string; restriction: string; period: { from: string; to: string };
        awarded: number; received: number; utilized: number;
        transactions: { date: string; kind: string; description: string; amount: number; sourceType: string | null }[];
      }>(`/accounts/grants/${fund.id}/utilization`);
      const safe = (value: string) => value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
      }[character] ?? character));
      const expenses = report.transactions.filter((transaction) => transaction.kind === "EXPENSE");
      const rows = expenses.map((transaction) =>
        `<tr><td>${safe(transaction.date)}</td><td>${safe(transaction.description)}</td><td>${safe(transaction.sourceType ?? "MANUAL")}</td><td class="money">₹${transaction.amount.toFixed(2)}</td></tr>`,
      ).join("");
      printWindow.document.write(`<!doctype html><html><head><title>Utilization Certificate ${safe(report.code)}</title><style>
        body{font:14px Arial,sans-serif;max-width:900px;margin:36px auto;color:#222;line-height:1.45}
        h1{text-align:center;font-size:22px;margin-bottom:28px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .meta div{border-bottom:1px solid #ddd;padding:8px 0}.summary{display:flex;justify-content:space-between;margin:24px 0}
        .summary div{border:1px solid #bbb;padding:12px;flex:1;margin-right:8px}.summary strong{display:block;margin-top:8px}
        table{width:100%;border-collapse:collapse;margin:22px 0}th,td{border:1px solid #aaa;padding:8px;text-align:left}
        .money{text-align:right;white-space:nowrap}.sign{display:flex;justify-content:space-between;margin-top:80px}.sign div{width:40%;border-top:1px solid #555;padding-top:8px}
        @media print{button{display:none}}
      </style></head><body><h1>Utilization Certificate</h1>
      <div class="meta">
        <div><b>Grant:</b> ${safe(report.name)} (${safe(report.code)})</div>
        <div><b>Donor / funding agency:</b> ${safe(report.donor)}</div>
        <div><b>Grant period:</b> ${safe(report.period.from)} to ${safe(report.period.to)}</div>
        <div><b>Approved purpose:</b> ${safe(report.restriction)}</div>
      </div>
      <div class="summary">
        <div>Amount awarded<strong>₹${report.awarded.toFixed(2)}</strong></div>
        <div>Funds received<strong>₹${report.received.toFixed(2)}</strong></div>
        <div>Amount utilized<strong>₹${report.utilized.toFixed(2)}</strong></div>
        <div>Unspent balance<strong>₹${(report.received - report.utilized).toFixed(2)}</strong></div>
      </div>
      <p>Certified that the expenditure listed below was recorded against the above restricted grant and is subject to the stated funding purpose.</p>
      <table><thead><tr><th>Date</th><th>Expenditure description</th><th>Source</th><th class="money">Amount</th></tr></thead><tbody>${rows || `<tr><td colspan="4">No grant expenditure recorded.</td></tr>`}</tbody></table>
      <p><b>Total expenditure:</b> ₹${report.utilized.toFixed(2)}</p>
      <div class="sign"><div>Prepared by (Accounts)</div><div>Authorized signatory / Institution seal</div></div>
      <p><button onclick="window.print()">Print / Save as PDF</button></p></body></html>`);
      printWindow.document.close();
    } catch (error) {
      printWindow.close();
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Finance Operations" description="Reconcile bank statements, control departmental budgets and track restricted grants." />
      <Tabs defaultValue="banking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="banking"><Landmark className="mr-2 size-4" />Banking</TabsTrigger>
          <TabsTrigger value="budgets"><FileSpreadsheet className="mr-2 size-4" />Budgets</TabsTrigger>
          <TabsTrigger value="grants">Grants</TabsTrigger>
        </TabsList>

        <TabsContent value="banking" className="space-y-4">
          {canManage && (
            <Card>
              <CardHeader><CardTitle className="text-base">Add bank account</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1"><Label>Account name</Label><Input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })} placeholder="General Operating Account" /></div>
                <div className="space-y-1"><Label>Bank</Label><Input value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} placeholder="Bank name" /></div>
                <div className="space-y-1"><Label>Last four account digits</Label><Input maxLength={4} value={bankForm.accountLast4} onChange={(e) => setBankForm({ ...bankForm, accountLast4: e.target.value.replace(/\D/g, "") })} placeholder="1234" /></div>
                <div className="space-y-1"><Label>Ledger asset account</Label>
                  <Select value={bankForm.ledgerAccountId} onValueChange={(ledgerAccountId) => setBankForm({ ...bankForm, ledgerAccountId })}>
                    <SelectTrigger><SelectValue placeholder="Choose ledger account" /></SelectTrigger>
                    <SelectContent>{ledgerAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} · {account.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Account type</Label>
                  <Select value={bankForm.accountType} onValueChange={(accountType) => setBankForm({ ...bankForm, accountType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["OPERATING", "HOSTEL", "TRUST", "GRANT", "OTHER"].map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Opening balance (INR)</Label><Input type="number" min="0" step="0.01" value={bankForm.openingBalance} onChange={(e) => setBankForm({ ...bankForm, openingBalance: e.target.value })} /></div>
                {!ledgerAccounts.length && <p className="text-sm text-muted-foreground md:col-span-3">Set up the branch chart of accounts in General Ledger before adding a bank account.</p>}
                <div className="md:col-span-3"><Button disabled={saving || !ledgerAccounts.length} onClick={saveBankAccount}><Plus className="mr-2 size-4" />Add bank account</Button></div>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {accounts.map((account) => (
              <Card key={account.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div><p className="font-medium">{account.name}</p><p className="text-sm text-muted-foreground">{account.bankName} · •••• {account.accountLast4} · {account.ledgerCode} {account.ledgerName}</p></div>
                  {canManage && <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-muted">
                    <Upload className="mr-2 size-4" />Import CSV
                    <input className="sr-only" type="file" accept=".csv,text/csv" data-bank-account-id={account.id} onChange={importStatement} />
                  </label>}
                </CardContent>
              </Card>
            ))}
            {!loading && !accounts.length && <p className="text-sm text-muted-foreground">No bank accounts set up yet.</p>}
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Unmatched statement lines</CardTitle><Button variant="outline" size="sm" onClick={() => loadBanking().catch((e: unknown) => toast.error(errorMessage(e)))}><RefreshCw className="mr-2 size-4" />Refresh</Button></CardHeader>
            <CardContent>
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead>Direction</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>{statementLines.map((line) => <TableRow key={line.id}>
                  <TableCell>{line.transactionDate}</TableCell><TableCell>{line.bankAccount}</TableCell><TableCell className="max-w-64 truncate">{line.description}</TableCell>
                  <TableCell><Badge variant="outline">{line.direction}</Badge></TableCell><TableCell className="text-right tabular-nums">{inr(line.amount)}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => suggestMatches(line.id)}><Link2 className="mr-1 size-4" />Suggestions</Button>
                    {canManage && <Button size="sm" variant="ghost" onClick={() => ignoreLine(line.id)}><Ban className="mr-1 size-4" />Ignore</Button>}
                  </div>
                  {!!matches[line.id]?.length && <div className="mt-2 space-y-2">{matches[line.id].map((match) => <div key={match.journalLineId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                    <span>{match.entryNo} · {match.entryDate} · {match.description} · {inr(match.amount)}</span>
                    {canManage && <Button size="sm" onClick={() => matchLine(line.id, match.journalLineId)}><Check className="mr-1 size-3" />Match</Button>}
                  </div>)}</div>}
                  </TableCell>
                </TableRow>)}
                {!statementLines.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No unmatched lines to reconcile.</TableCell></TableRow>}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budgets" className="space-y-4">
          {canManage && <Card>
            <CardHeader><CardTitle className="text-base">Set departmental budget</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Financial year</Label><Input value={budgetForm.fiscalYear} onChange={(e) => setBudgetForm({ ...budgetForm, fiscalYear: e.target.value })} placeholder="2026-27" /></div>
              <div className="space-y-1"><Label>Department</Label><Input value={budgetForm.department} onChange={(e) => setBudgetForm({ ...budgetForm, department: e.target.value })} placeholder="Computer Science" /></div>
              <div className="space-y-1"><Label>Category</Label><Input value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} placeholder="All or category name" /></div>
              <div className="space-y-1"><Label>Allocation (INR)</Label><Input type="number" min="0" step="0.01" value={budgetForm.allocated} onChange={(e) => setBudgetForm({ ...budgetForm, allocated: e.target.value })} /></div>
              <div className="space-y-1"><Label>Over-budget control</Label>
                <Select value={budgetForm.hardStop ? "HARD_STOP" : "WARNING"} onValueChange={(value) => setBudgetForm({ ...budgetForm, hardStop: value === "HARD_STOP" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="HARD_STOP">Block over-budget requisitions</SelectItem><SelectItem value="WARNING">Track only</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="flex items-end"><Button disabled={saving} onClick={saveBudget}><Plus className="mr-2 size-4" />Save budget</Button></div>
            </CardContent>
          </Card>}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Budget vs actual</CardTitle>
              <div className="flex gap-2"><Input className="w-32" value={budgetForm.fiscalYear} onChange={(e) => setBudgetForm({ ...budgetForm, fiscalYear: e.target.value })} /><Button variant="outline" onClick={() => loadBudgets().catch((e: unknown) => toast.error(errorMessage(e)))}>Load year</Button></div>
            </CardHeader>
            <CardContent><Table><TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Category</TableHead><TableHead>Allocation</TableHead><TableHead>Spent</TableHead><TableHead>Committed</TableHead><TableHead>Available</TableHead><TableHead>Control</TableHead></TableRow></TableHeader>
              <TableBody>{budgets.map((budget) => <TableRow key={budget.id}>
                <TableCell>{budget.department}</TableCell><TableCell>{budget.category}</TableCell><TableCell>{inr(budget.allocated)}</TableCell><TableCell>{inr(budget.spent)}</TableCell><TableCell>{inr(budget.committed)}</TableCell>
                <TableCell className={budget.available < 0 ? "font-semibold text-destructive" : ""}>{inr(budget.available)}</TableCell><TableCell><Badge variant={budget.hardStop ? "destructive" : "secondary"}>{budget.hardStop ? "Hard stop" : "Track"}</Badge></TableCell>
              </TableRow>)}
              {!budgets.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No budgets found for this financial year.</TableCell></TableRow>}</TableBody>
            </Table></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grants" className="space-y-4">
          {canManage && <Card>
            <CardHeader><CardTitle className="text-base">Register restricted grant</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Grant code</Label><Input value={grantForm.code} onChange={(e) => setGrantForm({ ...grantForm, code: e.target.value })} /></div>
              <div className="space-y-1"><Label>Grant name</Label><Input value={grantForm.name} onChange={(e) => setGrantForm({ ...grantForm, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Donor / agency</Label><Input value={grantForm.donor} onChange={(e) => setGrantForm({ ...grantForm, donor: e.target.value })} /></div>
              <div className="space-y-1 md:col-span-3"><Label>Restriction / purpose</Label><Input value={grantForm.restriction} onChange={(e) => setGrantForm({ ...grantForm, restriction: e.target.value })} /></div>
              <div className="space-y-1"><Label>Award amount</Label><Input type="number" min="0" step="0.01" value={grantForm.awarded} onChange={(e) => setGrantForm({ ...grantForm, awarded: e.target.value })} /></div>
              <div className="space-y-1"><Label>Funds received</Label><Input type="number" min="0" step="0.01" value={grantForm.received} onChange={(e) => setGrantForm({ ...grantForm, received: e.target.value })} /></div>
              <div className="space-y-1"><Label>Start date</Label><Input type="date" value={grantForm.startDate} onChange={(e) => setGrantForm({ ...grantForm, startDate: e.target.value })} /></div>
              <div className="space-y-1"><Label>End date</Label><Input type="date" value={grantForm.endDate} onChange={(e) => setGrantForm({ ...grantForm, endDate: e.target.value })} /></div>
              <div className="flex items-end"><Button disabled={saving} onClick={saveGrant}><Plus className="mr-2 size-4" />Create grant</Button></div>
            </CardContent>
          </Card>}
          {canManage && <Card>
            <CardHeader><CardTitle className="text-base">Record grant transaction</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Grant</Label><Select value={transactionGrant} onValueChange={setTransactionGrant}><SelectTrigger><SelectValue placeholder="Choose grant" /></SelectTrigger><SelectContent>{grants.filter((grant) => grant.status === "ACTIVE").map((grant) => <SelectItem key={grant.id} value={grant.id}>{grant.code} · {grant.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Type</Label><Select value={grantTxn.kind} onValueChange={(kind) => setGrantTxn({ ...grantTxn, kind })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RECEIPT">Funds received</SelectItem><SelectItem value="EXPENSE">Restricted spend</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={grantTxn.date} onChange={(e) => setGrantTxn({ ...grantTxn, date: e.target.value })} /></div>
              <div className="space-y-1"><Label>Description</Label><Input value={grantTxn.description} onChange={(e) => setGrantTxn({ ...grantTxn, description: e.target.value })} /></div>
              <div className="space-y-1"><Label>Amount</Label><Input type="number" min="0" step="0.01" value={grantTxn.amount} onChange={(e) => setGrantTxn({ ...grantTxn, amount: e.target.value })} /></div>
              {grantTxn.kind === "EXPENSE" && <>
                <div className="space-y-1"><Label>Expense category</Label><Input value={grantTxn.category} onChange={(e) => setGrantTxn({ ...grantTxn, category: e.target.value })} /></div>
                <div className="space-y-1"><Label>Payment method</Label><Select value={grantTxn.method} onValueChange={(method) => setGrantTxn({ ...grantTxn, method })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["BANK_TRANSFER", "UPI", "CHEQUE", "CASH"].map((method) => <SelectItem key={method} value={method}>{method.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div>
              </>}
              <div className="flex items-end"><Button disabled={saving || !transactionGrant} onClick={saveGrantTransaction}><Plus className="mr-2 size-4" />Record transaction</Button></div>
            </CardContent>
          </Card>}
          <div className="grid gap-4 xl:grid-cols-2">
            {grants.map((grant) => <Card key={grant.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div><CardTitle className="text-base">{grant.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{grant.code} · {grant.donor} · {grant.startDate} to {grant.endDate}</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportUtilization(grant)}><Download className="mr-2 size-4" />Utilization CSV</Button>
                  <Button variant="outline" size="sm" onClick={() => void printUtilizationCertificate(grant)}><Printer className="mr-2 size-4" />UC / PDF</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{grant.restriction}</p>
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div><p className="text-muted-foreground">Awarded</p><p className="font-semibold">{inr(grant.awarded)}</p></div>
                  <div><p className="text-muted-foreground">Received</p><p className="font-semibold">{inr(grant.received)}</p></div>
                  <div><p className="text-muted-foreground">Utilized</p><p className="font-semibold">{inr(grant.spent)}</p></div>
                  <div><p className="text-muted-foreground">Unspent</p><p className="font-semibold">{inr(grant.unspent)}</p></div>
                </div>
                <div className="max-h-44 overflow-auto">
                  <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>{grant.transactions.map((transaction) => <TableRow key={transaction.id}><TableCell>{transaction.date}</TableCell><TableCell>{transaction.kind}</TableCell><TableCell>{transaction.description}</TableCell><TableCell className="text-right">{inr(transaction.amount)}</TableCell></TableRow>)}
                    {!grant.transactions.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No transactions recorded.</TableCell></TableRow>}</TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>)}
          </div>
          {!loading && grants.length === 0 && <p className="text-sm text-muted-foreground">No restricted grants registered.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
