import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Wallet, TrendingUp, AlertTriangle, CheckCircle, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { feeAccount, payInstallment, useFeePayments } from "@/store/fees";
import { useClassRoster, useStudents } from "@/store/students";
import { StatCard, toneFrom } from "@/components/common/StatCard";

type FeeStatus = "Paid" | "Pending" | "Overdue";
type FeeRecord = { id: number; studentName: string; class: string; rollNo: string; amount: number; paid: number; due: number; status: FeeStatus; dueDate: string; nextInstallment?: { no: number; name: string; amount: number; lateFee: number }; };

const statuses = ["All", "Paid", "Pending", "Overdue"];

export function PrincipalFinance() {
  const { students } = useStudents();
  const payments = useFeePayments();
  const classes = ["All Classes", ...useClassRoster().classes];

  const feeRecords: FeeRecord[] = students.map((st) => {
    const acc = feeAccount(st, payments);
    const next = acc.nextDue;
    return {
      id: st.id,
      studentName: st.name,
      class: st.class,
      rollNo: st.rollNo,
      amount: acc.total,
      paid: acc.paid,
      due: acc.pending,
      status: acc.status,
      dueDate: next?.dueDate ?? "—",
      nextInstallment: next ? { no: next.no, name: next.name, amount: next.amount, lateFee: next.lateFee } : undefined,
    };
  });
  const lateFeesCollected = payments.reduce((a, p) => a + p.lateFee, 0);

  const collect = async (r: FeeRecord) => {
    const st = students.find((x) => x.id === r.id);
    if (!st || !r.nextInstallment) return;
    if (!(await payInstallment(st, r.nextInstallment.no, "Cash"))) return;
    toast.success(`${r.nextInstallment.name} collected from ${r.studentName}`, {
      description: `₹${r.nextInstallment.amount.toLocaleString("en-IN")}${r.nextInstallment.lateFee ? ` + ₹${r.nextInstallment.lateFee} late fee` : ""} (cash)`,
    });
  };
  const [selectedClass, setSelectedClass] = useState("All Classes");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = feeRecords.filter((r) => {
    const classMatch = selectedClass === "All Classes" || r.class === selectedClass;
    const statusMatch = selectedStatus === "All" || r.status === selectedStatus;
    const s = searchQuery.toLowerCase();
    return classMatch && statusMatch && (r.studentName.toLowerCase().includes(s) || r.rollNo.includes(s));
  });

  const totalCollected = feeRecords.reduce((a, r) => a + r.paid, 0);
  const totalPending   = feeRecords.reduce((a, r) => a + r.due, 0);
  const totalBilled    = feeRecords.reduce((a, r) => a + r.amount, 0);
  const fmt = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${(n / 1000).toFixed(0)}K`);

  const statusBadge = (s: FeeStatus) => {
    const map = { Paid: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300", Pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300", Overdue: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" };
    return map[s];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Finance</h1>
        <p className="text-sm text-muted-foreground mt-1">School-wide fee collection and financial overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Billed",    value: fmt(totalBilled),    icon: Wallet,        color: "text-foreground"  },
          { label: "Collected",       value: fmt(totalCollected), icon: CheckCircle,   color: "text-green-600"   },
          { label: "Pending",         value: fmt(totalPending),   icon: AlertTriangle, color: "text-orange-600"  },
          { label: "Collection Rate", value: `${totalBilled ? Math.round(totalCollected / totalBilled * 100) : 100}%`, icon: TrendingUp, color: "text-blue-600" },
          { label: "Late Fees",       value: fmt(lateFeesCollected), icon: IndianRupee, color: "text-purple-600" },
        ].map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} tone={toneFrom(stat.color)} />
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input placeholder="Search student…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fee Records ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-foreground">{r.studentName}</h4>
                    <Badge variant="outline" className="font-mono text-xs">{r.rollNo}</Badge>
                  </div>
                  <p className="text-sm text-foreground/60">{r.class} • {r.nextInstallment ? `${r.nextInstallment.name} due ${r.dueDate}` : "All installments paid"}</p>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-foreground/50">Total Fee</p>
                    <p className="text-sm font-semibold">₹{r.amount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-foreground/50">Paid</p>
                    <p className="text-sm font-semibold text-green-600">₹{r.paid.toLocaleString()}</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-foreground/50">Due</p>
                    <p className={`text-sm font-semibold ${r.due > 0 ? "text-red-600" : "text-foreground/40"}`}>₹{r.due.toLocaleString()}</p>
                  </div>
                  <Badge className={statusBadge(r.status)}>{r.status}</Badge>
                  {r.nextInstallment && (
                    <Button size="sm" variant="outline" onClick={() => collect(r)}>Collect</Button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-center py-12 text-foreground/40">No records found</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}