import { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, FilePlus2, Plus, Scale, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { today } from "@/lib/dates";
import { canAny } from "@/store/auth";
import { downloadCsv } from "@/store/inventory";

const CATEGORIES = ["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"] as const;
type AccountCategory = typeof CATEGORIES[number];
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr = (amount: number) => currency.format(amount);

interface LedgerAccount {
  id: string;
  branchId: string;
  code: string;
  name: string;
  category: AccountCategory;
  parentId: string | null;
  isSystem: boolean;
  isActive: boolean;
}

interface JournalLine {
  id: string;
  accountId: string;
  code: string;
  accountName: string;
  category: AccountCategory;
  description: string | null;
  debit: number;
  credit: number;
}

interface JournalEntry {
  id: string;
  entryNo: string;
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string | null;
  debitTotal: number;
  lines: JournalLine[];
}

interface ReportRow {
  code: string;
  name: string;
  amount: number;
}

interface LedgerReport {
  trialBalance: {
    accountId: string;
    code: string;
    name: string;
    category: AccountCategory;
    debits: number;
    credits: number;
    debitBalance: number;
    creditBalance: number;
  }[];
  trialBalanceTotals: { debits: number; credits: number; debitBalance: number; creditBalance: number };
  incomeExpenditure: { income: ReportRow[]; expenses: ReportRow[]; totalIncome: number; totalExpenses: number; surplus: number };
  balanceSheet: { assets: ReportRow[]; liabilities: ReportRow[]; equity: ReportRow[]; totalAssets: number; totalLiabilities: number; totalEquity: number };
}

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

const defaultLine = (): DraftLine => ({ accountId: "", debit: "", credit: "", description: "" });
const financialYearStart = () => {
  const date = new Date();
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-04-01`;
};

function totals(lines: DraftLine[]) {
  return lines.reduce((sum, line) => ({
    debit: sum.debit + (Number(line.debit) || 0),
    credit: sum.credit + (Number(line.credit) || 0),
  }), { debit: 0, credit: 0 });
}

function AmountTable({ title, rows, total }: { title: string; rows: ReportRow[]; total: number }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="py-3 text-sm text-muted-foreground">No balances in this period.</p>}
        {rows.map((row) => (
          <div key={`${row.code}-${row.name}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">{row.code && <span className="mr-2 font-mono text-xs text-muted-foreground">{row.code}</span>}{row.name}</span>
            <span className="shrink-0 font-medium tabular-nums">{inr(row.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
          <span>Total</span><span className="tabular-nums">{inr(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function GeneralLedger() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [report, setReport] = useState<LedgerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("accounts");
  const [accountDialog, setAccountDialog] = useState(false);
  const [journalDialog, setJournalDialog] = useState(false);
  const [accountForm, setAccountForm] = useState({ code: "", name: "", category: "ASSET" as AccountCategory, parentId: "" });
  const [journalForm, setJournalForm] = useState({ entryDate: today(), description: "", lines: [defaultLine(), defaultLine()] });
  const [from, setFrom] = useState(financialYearStart);
  const [to, setTo] = useState(today);
  const canManage = canAny("accounting.manage");
  const sums = totals(journalForm.lines);

  const loadAccounts = async () => setAccounts(await api.get<LedgerAccount[]>("/accounts/ledger/accounts"));
  const loadJournals = async () => setJournals(await api.get<JournalEntry[]>("/accounts/ledger/journals"));
  const loadReport = async () => {
    const result = await api.get<LedgerReport>(`/accounts/ledger/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    setReport(result);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<LedgerAccount[]>("/accounts/ledger/accounts"),
      api.get<JournalEntry[]>("/accounts/ledger/journals"),
      api.get<LedgerReport>(`/accounts/ledger/reports?from=${encodeURIComponent(financialYearStart())}&to=${encodeURIComponent(today())}`),
    ]).then(([nextAccounts, nextJournals, nextReport]) => {
      if (!active) return;
      setAccounts(nextAccounts);
      setJournals(nextJournals);
      setReport(nextReport);
    }).catch((error: unknown) => {
      if (active) toast.error(errorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const sortedAccounts = useMemo(() => accounts.filter((account) => account.isActive), [accounts]);

  const setupChart = async () => {
    setSaving(true);
    try {
      const created = await api.post<LedgerAccount[]>("/accounts/ledger/accounts/setup", {});
      setAccounts(created);
      toast.success("Default chart of accounts created for this branch");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveAccount = async () => {
    setSaving(true);
    try {
      const created = await api.post<LedgerAccount>("/accounts/ledger/accounts", {
        ...accountForm,
        parentId: accountForm.parentId || null,
      });
      setAccounts((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)));
      setAccountDialog(false);
      setAccountForm({ code: "", name: "", category: "ASSET", parentId: "" });
      toast.success("Ledger account added");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveJournal = async () => {
    if (Math.round(sums.debit * 100) !== Math.round(sums.credit * 100) || sums.debit <= 0) {
      toast.error("Journal totals must be greater than zero and debits must equal credits");
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<JournalEntry>("/accounts/ledger/journals", {
        entryDate: journalForm.entryDate,
        description: journalForm.description.trim(),
        lines: journalForm.lines.map((line) => ({
          accountId: line.accountId,
          description: line.description.trim() || undefined,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
        })),
      });
      setJournals((current) => [created, ...current].slice(0, 200));
      setJournalDialog(false);
      setJournalForm({ entryDate: today(), description: "", lines: [defaultLine(), defaultLine()] });
      toast.success("Balanced journal voucher posted");
      try {
        await loadReport();
      } catch (error) {
        toast.error(`Voucher posted, but statements could not be refreshed: ${errorMessage(error)}`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const refreshReport = async () => {
    setSaving(true);
    try {
      await loadReport();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const exportTrialBalance = () => {
    if (!report) return;
    downloadCsv("trial-balance.csv", ["Code", "Account", "Category", "Debits", "Credits", "Debit balance", "Credit balance"], [
      ...report.trialBalance.map((row) => [row.code, row.name, row.category, row.debits, row.credits, row.debitBalance, row.creditBalance]),
      ["", "Totals", "", report.trialBalanceTotals.debits, report.trialBalanceTotals.credits, report.trialBalanceTotals.debitBalance, report.trialBalanceTotals.creditBalance],
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Ledger"
        description="Chart of accounts, balanced journal vouchers and financial statements"
        actions={canManage && accounts.length > 0 ? (
          <Button className="gap-2" onClick={() => setJournalDialog(true)}><FilePlus2 className="h-4 w-4" /> New journal voucher</Button>
        ) : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ledger accounts" value={accounts.length} icon={BookOpen} tone="indigo" hint="active chart for this branch" />
        <StatCard label="Posted vouchers" value={journals.length} icon={FilePlus2} tone="blue" hint={journals.length >= 200 ? "latest 200 shown" : "immutable after posting"} />
        <StatCard
          label="Trial balance"
          value={report ? (Math.round(report.trialBalanceTotals.debits * 100) === Math.round(report.trialBalanceTotals.credits * 100) ? "Balanced" : "Out of balance") : "—"}
          icon={Scale}
          tone={report && Math.round(report.trialBalanceTotals.debits * 100) === Math.round(report.trialBalanceTotals.credits * 100) ? "green" : "amber"}
          hint="for the selected date range"
        />
      </div>

      <Card><CardContent className="p-4 text-sm text-muted-foreground">
        Phase 1 ledger: vouchers are entered manually. Existing fee collections, vendor payments, expenses and payroll are not yet auto-posted or backfilled here; opening balances are not imported. Reconcile and connect those source transactions before using these figures as official financial statements.
      </CardContent></Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="journals">Journal Vouchers</TabsTrigger>
          <TabsTrigger value="statements">Financial Statements</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle className="text-base">Chart of Accounts</CardTitle><p className="mt-1 text-sm text-muted-foreground">Branch-level ledgers for assets, liabilities, income, expenses and trust funds.</p></div>
              {canManage && accounts.length === 0 && (
                <Button onClick={setupChart} disabled={saving} className="gap-2"><Wallet className="h-4 w-4" /> Set up default chart</Button>
              )}
              {canManage && accounts.length > 0 && (
                <Button variant="outline" onClick={() => setAccountDialog(true)} className="gap-2"><Plus className="h-4 w-4" /> Add account</Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading ledger…</p> : accounts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-medium">Chart of accounts is not set up</p>
                  <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Create the standard school accounts to start posting vouchers and preparing statements.</p>
                  {!canManage && <p className="mt-3 text-sm text-muted-foreground">Ask an Accounts Manager to set up this branch.</p>}
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account name</TableHead><TableHead>Category</TableHead><TableHead>Type</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-xs">{account.code}</TableCell>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell><Badge variant="secondary">{account.category}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{account.isSystem ? "System" : "Custom"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journals" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Posted Journal Vouchers</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {journals.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No vouchers have been posted in this branch.</p>
              ) : journals.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border">
                  <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-medium">{entry.description}</p><p className="mt-0.5 text-xs text-muted-foreground">{entry.entryNo} · {entry.entryDate} · {entry.sourceType === "MANUAL" ? "Manual" : entry.sourceType}</p></div>
                    <Badge variant="outline">Posted · {inr(entry.debitTotal)}</Badge>
                  </div>
                  <div className="space-y-2 p-3">
                    {entry.lines.map((line) => (
                      <div key={line.id} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm">
                        <span className="min-w-0 truncate"><span className="mr-2 font-mono text-xs text-muted-foreground">{line.code}</span>{line.accountName}</span>
                        <span className="w-24 text-right tabular-nums">{line.debit ? inr(line.debit) : "—"}</span>
                        <span className="w-24 text-right tabular-nums">{line.credit ? inr(line.credit) : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statements" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="space-y-2"><Label htmlFor="ledger-from">From</Label><Input id="ledger-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="ledger-to">To</Label><Input id="ledger-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
              <Button variant="outline" onClick={exportTrialBalance} disabled={!report} className="gap-2"><Download className="h-4 w-4" /> Export trial balance</Button>
              <Button onClick={refreshReport} disabled={saving}>Run statements</Button>
            </CardContent>
          </Card>
          {!report ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Run the statements to see account balances.</CardContent></Card> : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Trial Balance · As of {to}</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Debits</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Dr balance</TableHead><TableHead className="text-right">Cr balance</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {report.trialBalance.map((row) => (
                        <TableRow key={row.accountId}><TableCell className="font-mono text-xs">{row.code}</TableCell><TableCell className="font-medium">{row.name}</TableCell><TableCell><Badge variant="secondary">{row.category}</Badge></TableCell><TableCell className="text-right">{inr(row.debits)}</TableCell><TableCell className="text-right">{inr(row.credits)}</TableCell><TableCell className="text-right">{inr(row.debitBalance)}</TableCell><TableCell className="text-right">{inr(row.creditBalance)}</TableCell></TableRow>
                      ))}
                      {report.trialBalance.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No ledger accounts are set up.</TableCell></TableRow>}
                    </TableBody>
                    <tfoot><TableRow className="font-semibold"><TableCell colSpan={3}>Totals</TableCell><TableCell className="text-right">{inr(report.trialBalanceTotals.debits)}</TableCell><TableCell className="text-right">{inr(report.trialBalanceTotals.credits)}</TableCell><TableCell className="text-right">{inr(report.trialBalanceTotals.debitBalance)}</TableCell><TableCell className="text-right">{inr(report.trialBalanceTotals.creditBalance)}</TableCell></TableRow></tfoot>
                  </Table>
                </CardContent>
              </Card>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <AmountTable title="Income & Expenditure · Income" rows={report.incomeExpenditure.income} total={report.incomeExpenditure.totalIncome} />
                  <AmountTable title="Income & Expenditure · Expenses" rows={report.incomeExpenditure.expenses} total={report.incomeExpenditure.totalExpenses} />
                  <Card><CardContent className="flex justify-between p-5 text-sm font-semibold"><span>{report.incomeExpenditure.surplus >= 0 ? "Surplus" : "Deficit"}</span><span>{inr(Math.abs(report.incomeExpenditure.surplus))}</span></CardContent></Card>
                </div>
                <div className="space-y-4">
                  <AmountTable title="Balance Sheet · Assets" rows={report.balanceSheet.assets} total={report.balanceSheet.totalAssets} />
                  <AmountTable title="Balance Sheet · Liabilities" rows={report.balanceSheet.liabilities} total={report.balanceSheet.totalLiabilities} />
                  <AmountTable title="Balance Sheet · Trust / Capital & current earnings" rows={report.balanceSheet.equity} total={report.balanceSheet.totalEquity} />
                  <Card><CardContent className="flex justify-between p-5 text-sm font-semibold"><span>Liabilities + Equity</span><span>{inr(report.balanceSheet.totalLiabilities + report.balanceSheet.totalEquity)}</span></CardContent></Card>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add ledger account</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label htmlFor="account-code">Account code</Label><Input id="account-code" value={accountForm.code} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value })} maxLength={20} /></div>
            <div className="space-y-2"><Label htmlFor="account-name">Account name</Label><Input id="account-name" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} maxLength={120} /></div>
            <div className="space-y-2"><Label>Category</Label><Select value={accountForm.category} onValueChange={(value: AccountCategory) => setAccountForm({ ...accountForm, category: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Parent account (optional)</Label><Select value={accountForm.parentId || "none"} onValueChange={(value) => setAccountForm({ ...accountForm, parentId: value === "none" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No parent</SelectItem>{sortedAccounts.filter((account) => account.category === accountForm.category).map((account) => <SelectItem key={account.id} value={account.id}>{account.code} · {account.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAccountDialog(false)}>Cancel</Button><Button onClick={saveAccount} disabled={saving || !accountForm.code.trim() || !accountForm.name.trim()}>Save account</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={journalDialog} onOpenChange={setJournalDialog}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>New journal voucher</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="journal-date">Entry date</Label><Input id="journal-date" type="date" max={today()} value={journalForm.entryDate} onChange={(event) => setJournalForm({ ...journalForm, entryDate: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="journal-description">Description</Label><Input id="journal-description" value={journalForm.description} onChange={(event) => setJournalForm({ ...journalForm, description: event.target.value })} maxLength={300} /></div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(130px,1fr)_minmax(120px,1fr)_100px_100px_32px] gap-2 text-xs font-medium text-muted-foreground"><span>Account</span><span>Memo</span><span>Debit</span><span>Credit</span><span /></div>
            {journalForm.lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[minmax(130px,1fr)_minmax(120px,1fr)_100px_100px_32px] items-center gap-2">
                <Select value={line.accountId} onValueChange={(value) => setJournalForm({ ...journalForm, lines: journalForm.lines.map((item, i) => i === index ? { ...item, accountId: value } : item) })}>
                  <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                  <SelectContent>{sortedAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} · {account.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input aria-label={`Line ${index + 1} memo`} value={line.description} onChange={(event) => setJournalForm({ ...journalForm, lines: journalForm.lines.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} placeholder="Optional" />
                <Input aria-label={`Line ${index + 1} debit`} type="number" min={0} step="0.01" value={line.debit} onChange={(event) => setJournalForm({ ...journalForm, lines: journalForm.lines.map((item, i) => i === index ? { ...item, debit: event.target.value, credit: event.target.value ? "" : item.credit } : item) })} />
                <Input aria-label={`Line ${index + 1} credit`} type="number" min={0} step="0.01" value={line.credit} onChange={(event) => setJournalForm({ ...journalForm, lines: journalForm.lines.map((item, i) => i === index ? { ...item, credit: event.target.value, debit: event.target.value ? "" : item.debit } : item) })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={journalForm.lines.length <= 2} onClick={() => setJournalForm({ ...journalForm, lines: journalForm.lines.filter((_, i) => i !== index) })}>×</Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setJournalForm({ ...journalForm, lines: [...journalForm.lines, defaultLine()] })}><Plus className="mr-1 h-4 w-4" /> Add line</Button>
          </div>
          <div className="flex flex-wrap justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <span>Debits <strong>{inr(sums.debit)}</strong></span><span>Credits <strong>{inr(sums.credit)}</strong></span>
            <span className={Math.round(sums.debit * 100) === Math.round(sums.credit * 100) && sums.debit > 0 ? "text-emerald-700" : "text-amber-700"}>{Math.round(sums.debit * 100) === Math.round(sums.credit * 100) && sums.debit > 0 ? "Balanced" : "Amounts must balance"}</span>
          </div>
          <p className="text-xs text-muted-foreground">Posted vouchers are immutable. If a correction is needed, create a reversing voucher and repost correctly.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setJournalDialog(false)}>Cancel</Button><Button onClick={saveJournal} disabled={saving || !journalForm.description.trim() || !journalForm.entryDate || journalForm.lines.some((line) => !line.accountId) || sums.debit <= 0 || Math.round(sums.debit * 100) !== Math.round(sums.credit * 100)}>Post voucher</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
