import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarOff, ClipboardList, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { inr, monthLabel, monthOf } from "@/store/finance";
import { leaveDays, onLeaveToday, useLeaves, usePayroll, useStaff } from "@/store/hr";
import { useTeachers } from "@/store/teachers";

export function HRDashboard() {
  const { teachers } = useTeachers();
  const staff = useStaff();
  const leaves = useLeaves();
  const payroll = usePayroll();
  const month = monthOf();

  const active = teachers.filter((t) => t.status !== "Resigned").length + staff.filter((s) => s.status !== "Resigned").length;
  const awayToday = [
    ...teachers.filter((t) => onLeaveToday(leaves, "teacher", t.id)).map((t) => ({ name: t.name, role: t.designation })),
    ...staff.filter((s) => onLeaveToday(leaves, "staff", s.id)).map((s) => ({ name: s.name, role: s.designation })),
  ];
  const pending = leaves.filter((l) => l.status === "Pending");
  const run = payroll.find((r) => r.month === month);

  const byDept = Object.entries(
    [...teachers.map((t) => t.department), ...staff.map((s) => s.department)].reduce<Record<string, number>>((m, d) => ({ ...m, [d]: (m[d] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <PageHeader title="HR Overview" description="Staff, leave and salaries at a glance" actions={<Button asChild><Link to="/hr/leaves">Review Leaves</Link></Button>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active staff" value={active} icon={Users} tone="indigo" hint={`${teachers.length} teaching · ${staff.length} non-teaching`} />
        <StatCard label="On leave today" value={awayToday.length} icon={CalendarOff} tone="amber" />
        <StatCard label="Pending leave requests" value={pending.length} icon={ClipboardList} tone="orange" href="/hr/leaves" />
        <StatCard label={`Payroll · ${monthLabel(month)}`} value={run ? inr(run.lines.reduce((a, l) => a + l.net, 0)) : "Not run"} icon={Wallet} tone="green" hint={run?.paidOn ? "Paid" : run ? "Processed, not paid" : "Process from Payroll"} href="/hr/payroll" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Pending Leave Requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting for approval.</p>}
            {pending.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{l.person.name}</p>
                  <p className="text-xs text-muted-foreground">{l.type} · {l.from} → {l.to} ({leaveDays(l)} day{leaveDays(l) > 1 ? "s" : ""}) · {l.reason}</p>
                </div>
                <Badge variant="secondary">Pending</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Staff by Department</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {byDept.map(([dept, n]) => (
              <div key={dept} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-foreground">{dept}</span>
                <span className="font-semibold text-foreground">{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Away Today</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {awayToday.length === 0 && <p className="text-sm text-muted-foreground">Everyone is in today.</p>}
          {awayToday.map((p) => <Badge key={p.name} variant="outline" className="py-1">{p.name} · {p.role}</Badge>)}
        </CardContent>
      </Card>
    </div>
  );
}
