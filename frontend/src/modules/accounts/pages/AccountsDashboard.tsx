import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, IndianRupee, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { feeAccount, useFeePayments } from "@/store/fees";
import { inr, monthLabel, monthOf, useExpenses } from "@/store/finance";
import { usePayroll } from "@/store/hr";
import { useStudents } from "@/store/students";

export function AccountsDashboard() {
  const { students } = useStudents();
  const payments = useFeePayments();
  const expenses = useExpenses();
  const payroll = usePayroll();
  const month = monthOf();

  const accounts = students.map((s) => ({ student: s, acc: feeAccount(s, payments) }));
  const billed = accounts.reduce((a, x) => a + x.acc.total, 0);
  const collected = accounts.reduce((a, x) => a + x.acc.paid, 0);
  const overdue = accounts.reduce((a, x) => a + x.acc.overdueAmount, 0);

  const monthIncome = payments.filter((p) => monthOf(p.date) === month).reduce((a, p) => a + p.amount + p.lateFee, 0);
  const monthExpense = expenses.filter((e) => monthOf(e.date) === month).reduce((a, e) => a + e.amount, 0);
  const salaryThisMonth = payroll.find((r) => r.month === month);
  const salaryOut = salaryThisMonth?.paidOn ? salaryThisMonth.lines.reduce((a, l) => a + l.net, 0) : 0;

  const byCategory = Object.entries(
    expenses.filter((e) => monthOf(e.date) === month).reduce<Record<string, number>>((m, e) => ({ ...m, [e.category]: (m[e.category] ?? 0) + e.amount }), {}),
  ).sort((a, b) => b[1] - a[1]);

  const recentPayments = [...payments].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 6).map((p) => ({
    ...p, student: students.find((s) => s.id === p.studentId),
  }));
  const defaulters = accounts.filter((x) => x.acc.overdueAmount > 0).sort((a, b) => b.acc.overdueAmount - a.acc.overdueAmount).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Overview"
        description={`Fee collection, expenses and salaries · ${monthLabel(month)}`}
        actions={<Button asChild><Link to="/accountant/fees">Collect Fees</Link></Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Collected this month" value={inr(monthIncome)} icon={ArrowDownCircle} tone="green" hint="fees + late fees" />
        <StatCard label="Spent this month" value={inr(monthExpense + salaryOut)} icon={ArrowUpCircle} tone="red" hint={`${inr(monthExpense)} expenses${salaryOut ? ` + ${inr(salaryOut)} salaries` : ""}`} />
        <StatCard label="Fee collection (year)" value={`${billed ? Math.round((collected / billed) * 100) : 0}%`} icon={Wallet} tone="indigo" hint={`${inr(collected)} of ${inr(billed)}`} />
        <StatCard label="Overdue fees" value={inr(overdue)} icon={AlertTriangle} tone="amber" hint={`${accounts.filter((x) => x.acc.overdueAmount > 0).length} students`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Recent Fee Payments</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{p.student?.name ?? "Former student"} <span className="text-muted-foreground font-normal">· {p.student?.class}</span></p>
                  <p className="text-xs text-muted-foreground">Installment {p.installment} · {p.method} · {p.date}</p>
                </div>
                <p className="font-semibold text-emerald-600 shrink-0">{inr(p.amount + p.lateFee)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><IndianRupee className="h-4 w-4 text-primary" /> Expenses by Category · {monthLabel(month)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {byCategory.length === 0 && <p className="text-sm text-muted-foreground">No expenses recorded this month.</p>}
            {byCategory.map(([cat, amount]) => (
              <div key={cat}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-foreground">{cat}</span>
                  <span className="text-muted-foreground">{inr(amount)}</span>
                </div>
                <Progress value={monthExpense ? (amount / monthExpense) * 100 : 0} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Top Fee Defaulters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {defaulters.length === 0 && <p className="text-sm text-muted-foreground">No overdue fees.</p>}
          {defaulters.map(({ student, acc }) => (
            <div key={student.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">{student.name}</p>
                <p className="text-xs text-muted-foreground">{student.class} · Roll {student.rollNo} · {student.fatherPhone || student.phone}</p>
              </div>
              <Badge variant="destructive">{inr(acc.overdueAmount)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
