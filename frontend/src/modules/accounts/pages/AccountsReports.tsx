import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { useFeePayments } from "@/store/fees";
import { inr, monthLabel, monthOf, useExpenses } from "@/store/finance";
import { usePayroll } from "@/store/hr";
import { downloadCsv } from "@/store/inventory";

/** Month-by-month income and spending. */
export function AccountsReports() {
  const payments = useFeePayments();
  const expenses = useExpenses();
  const payroll = usePayroll();

  const months = [...new Set([
    ...payments.map((p) => monthOf(p.date)),
    ...expenses.map((e) => monthOf(e.date)),
    ...payroll.map((r) => r.month),
  ])].sort().reverse();

  const rows = months.map((m) => {
    const fees = payments.filter((p) => monthOf(p.date) === m).reduce((a, p) => a + p.amount, 0);
    const lateFees = payments.filter((p) => monthOf(p.date) === m).reduce((a, p) => a + p.lateFee, 0);
    const spend = expenses.filter((e) => monthOf(e.date) === m).reduce((a, e) => a + e.amount, 0);
    const run = payroll.find((r) => r.month === m && r.paidOn);
    const salaries = run ? run.lines.reduce((a, l) => a + l.net, 0) : 0;
    const income = fees + lateFees;
    const outgoing = spend + salaries;
    return { month: m, fees, lateFees, income, spend, salaries, outgoing, net: income - outgoing };
  });
  const totals = rows.reduce((a, r) => ({ income: a.income + r.income, outgoing: a.outgoing + r.outgoing }), { income: 0, outgoing: 0 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description="Income from fees against expenses and salaries, month by month"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => downloadCsv("income-expense.csv", ["Month", "Fees", "Late fees", "Expenses", "Salaries", "Net"], rows.map((r) => [monthLabel(r.month), r.fees, r.lateFees, r.spend, r.salaries, r.net]))}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total income</p><p className="font-display text-2xl font-semibold text-emerald-600 mt-1">{inr(totals.income)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total outgoing</p><p className="font-display text-2xl font-semibold text-red-600 mt-1">{inr(totals.outgoing)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Net</p><p className={`font-display text-2xl font-semibold mt-1 ${totals.income - totals.outgoing >= 0 ? "text-emerald-600" : "text-red-600"}`}>{inr(totals.income - totals.outgoing)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Income vs Outgoing</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Late fees</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Salaries</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.month}>
                  <TableCell className="font-medium">{monthLabel(r.month)}</TableCell>
                  <TableCell className="text-right">{inr(r.fees)}</TableCell>
                  <TableCell className="text-right">{inr(r.lateFees)}</TableCell>
                  <TableCell className="text-right">{inr(r.spend)}</TableCell>
                  <TableCell className="text-right">{inr(r.salaries)}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>{inr(r.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
