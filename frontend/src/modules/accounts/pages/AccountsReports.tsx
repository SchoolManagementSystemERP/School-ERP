import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { feeInstallmentsForStudent, useFeePayments } from "@/store/fees";
import { inr, monthLabel, monthOf, useExpenses } from "@/store/finance";
import { usePayroll } from "@/store/hr";
import { downloadCsv } from "@/store/inventory";
import { useStudents } from "@/store/students";
import { today } from "@/lib/dates";

/** Month-by-month income and spending. */
export function AccountsReports() {
  const payments = useFeePayments();
  const { students } = useStudents();
  const expenses = useExpenses();
  const payroll = usePayroll();
  const [ageingClass, setAgeingClass] = useState("All Classes");

  const months = [...new Set([
    ...payments.map((p) => monthOf(p.date)),
    ...expenses.map((e) => monthOf(e.date)),
    ...payroll.map((r) => r.month),
  ])].sort().reverse();

  const rows = months.map((m) => {
    const fees = payments.filter((p) => monthOf(p.date) === m).reduce((a, p) => a + (p.netAmount ?? p.amount), 0);
    const lateFees = payments.filter((p) => monthOf(p.date) === m).reduce((a, p) => a + p.lateFee, 0);
    const spend = expenses.filter((e) => monthOf(e.date) === m).reduce((a, e) => a + e.amount, 0);
    const run = payroll.find((r) => r.month === m && r.paidOn);
    const salaries = run ? run.lines.reduce((a, l) => a + l.net, 0) : 0;
    const income = fees + lateFees;
    const outgoing = spend + salaries;
    return { month: m, fees, lateFees, income, spend, salaries, outgoing, net: income - outgoing };
  });
  const totals = rows.reduce((a, r) => ({ income: a.income + r.income, outgoing: a.outgoing + r.outgoing }), { income: 0, outgoing: 0 });
  const byFeeHead = Object.values(payments.reduce<Record<string, { feeHead: string; collected: number }>>((result, payment) => {
    const feeHead = (payment.feeHead ?? "TUITION").replaceAll("_", " ");
    const row = result[feeHead] ?? (result[feeHead] = { feeHead, collected: 0 });
    row.collected += (payment.netAmount ?? payment.amount) + payment.lateFee;
    return result;
  }, {})).sort((a, b) => a.feeHead.localeCompare(b.feeHead));
  const byPaymentMode = Object.values(payments.reduce<Record<string, { method: string; collected: number }>>((result, payment) => {
    const method = payment.method;
    const row = result[method] ?? (result[method] = { method, collected: 0 });
    row.collected += (payment.netAmount ?? payment.amount) + payment.lateFee;
    return result;
  }, {})).sort((a, b) => a.method.localeCompare(b.method));
  const classes = ["All Classes", ...new Set(students.map((student) => student.class).filter(Boolean))];
  const overdueRows = useMemo(() => students.flatMap((student) => feeInstallmentsForStudent(student.id)
    .filter((installment) => installment.dueDate < today())
    .map((installment) => {
      const daysPastDue = Math.floor((Date.parse(today()) - Date.parse(installment.dueDate)) / 86_400_000);
      return {
        studentName: student.name, admissionNo: student.admissionNo, className: student.class,
        feeHead: installment.feeHead.replaceAll("_", " "), installment: installment.name,
        dueDate: installment.dueDate, daysPastDue, amount: installment.amount,
        ageing: daysPastDue <= 30 ? "1–30 days" : daysPastDue <= 60 ? "31–60 days" : daysPastDue <= 90 ? "61–90 days" : "90+ days",
      };
    })).filter((row) => ageingClass === "All Classes" || row.className === ageingClass)
    .sort((a, b) => b.daysPastDue - a.daysPastDue), [students, ageingClass, payments]);
  const ageingTotals = overdueRows.reduce<Record<string, number>>((result, row) => {
    result[row.ageing] = (result[row.ageing] ?? 0) + row.amount;
    return result;
  }, {});

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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Collection by fee head</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Fee head</TableHead><TableHead className="text-right">Net collected</TableHead></TableRow></TableHeader>
              <TableBody>{byFeeHead.map((row) => <TableRow key={row.feeHead}><TableCell>{row.feeHead}</TableCell><TableCell className="text-right">{inr(row.collected)}</TableCell></TableRow>)}
              {!byFeeHead.length && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No collections in this academic year.</TableCell></TableRow>}</TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Collection by payment mode</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Payment mode</TableHead><TableHead className="text-right">Net collected</TableHead></TableRow></TableHeader>
              <TableBody>{byPaymentMode.map((row) => <TableRow key={row.method}><TableCell>{row.method.replaceAll("_", " ")}</TableCell><TableCell className="text-right">{inr(row.collected)}</TableCell></TableRow>)}
              {!byPaymentMode.length && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No collections in this academic year.</TableCell></TableRow>}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">Ageing analysis · overdue fee installments</CardTitle><p className="mt-1 text-sm text-muted-foreground">Outstanding amounts exclude recorded refunds.</p></div>
          <div className="flex flex-wrap gap-2">
            <Select value={ageingClass} onValueChange={setAgeingClass}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{classes.map((className) => <SelectItem key={className} value={className}>{className}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" className="gap-2" onClick={() => downloadCsv("fee-ageing.csv", ["Student", "Admission No", "Class", "Fee head", "Installment", "Due date", "Days overdue", "Ageing", "Outstanding"], overdueRows.map((row) => [row.studentName, row.admissionNo, row.className, row.feeHead, row.installment, row.dueDate, row.daysPastDue, row.ageing, row.amount]))}><Download className="h-4 w-4" />Export ageing</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          <div className="flex flex-wrap gap-4 text-sm">
            {["1–30 days", "31–60 days", "61–90 days", "90+ days"].map((bucket) => <div key={bucket}><span className="text-muted-foreground">{bucket}: </span><strong>{inr(ageingTotals[bucket] ?? 0)}</strong></div>)}
          </div>
          <Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Fee head</TableHead><TableHead>Installment</TableHead><TableHead>Due date</TableHead><TableHead>Days overdue</TableHead><TableHead>Ageing</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
            <TableBody>{overdueRows.map((row) => <TableRow key={`${row.admissionNo}-${row.feeHead}-${row.installment}`}><TableCell>{row.studentName} · {row.admissionNo}</TableCell><TableCell>{row.className}</TableCell><TableCell>{row.feeHead}</TableCell><TableCell>{row.installment}</TableCell><TableCell>{row.dueDate}</TableCell><TableCell>{row.daysPastDue}</TableCell><TableCell>{row.ageing}</TableCell><TableCell className="text-right">{inr(row.amount)}</TableCell></TableRow>)}
            {!overdueRows.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No overdue installments for this class.</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
