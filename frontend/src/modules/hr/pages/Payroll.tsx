import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Download, Play, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { inr, monthLabel, monthOf } from "@/store/finance";
import { markPayrollPaid, processPayroll, usePayroll } from "@/store/hr";
import { downloadCsv } from "@/store/inventory";

/** Monthly salary processing — shared by the HR and Accounts portals. */
export function Payroll() {
  const runs = usePayroll();
  const current = monthOf();
  const [month, setMonth] = useState(runs.some((r) => r.month === current) ? current : runs.at(-1)?.month ?? current);
  const run = runs.find((r) => r.month === month);
  const months = [...new Set([...runs.map((r) => r.month), current])].sort().reverse();

  const gross = run?.lines.reduce((a, l) => a + l.gross, 0) ?? 0;
  const deductions = run?.lines.reduce((a, l) => a + l.deductions, 0) ?? 0;
  const net = gross - deductions;

  const process = () => {
    processPayroll(month);
    toast.success(`Payroll processed for ${monthLabel(month)}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Monthly salaries for teaching and non-teaching staff (PF 12% of basic + ₹200 professional tax)"
        actions={
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Employees" value={run?.lines.length ?? 0} icon={Users} tone="indigo" />
        <StatCard label="Gross salary" value={inr(gross)} icon={Wallet} tone="blue" />
        <StatCard label="Deductions" value={inr(deductions)} icon={Wallet} tone="amber" />
        <StatCard label="Net payable" value={inr(net)} icon={CheckCircle2} tone="green" hint={run?.paidOn ? `Paid on ${run.paidOn}` : run ? "Not paid yet" : "Not processed"} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{monthLabel(month)}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {run && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => downloadCsv(`payroll-${month}.csv`, ["Emp ID", "Name", "Designation", "Gross", "Deductions", "Net"], run.lines.map((l) => [l.empId, l.name, l.designation, l.gross, l.deductions, l.net]))}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            )}
            {!run?.paidOn && (
              <Button size="sm" variant={run ? "outline" : "default"} className="gap-1" onClick={process}>
                <Play className="h-4 w-4" /> {run ? "Re-process" : "Process Payroll"}
              </Button>
            )}
            {run && !run.paidOn && (
              <Button size="sm" className="gap-1" onClick={() => { markPayrollPaid(month); toast.success("Salaries marked as paid"); }}>
                <CheckCircle2 className="h-4 w-4" /> Mark as Paid
              </Button>
            )}
            {run?.paidOn && <Badge className="bg-emerald-600">Paid · {run.paidOn}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!run ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Payroll for {monthLabel(month)} has not been processed yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emp ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.lines.map((l) => (
                  <TableRow key={`${l.kind}-${l.id}`}>
                    <TableCell className="font-mono text-xs">{l.empId}</TableCell>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="text-muted-foreground">{l.designation}</TableCell>
                    <TableCell><Badge variant="secondary">{l.kind === "teacher" ? "Teaching" : "Non-teaching"}</Badge></TableCell>
                    <TableCell className="text-right">{inr(l.gross)}</TableCell>
                    <TableCell className="text-right text-red-600">−{inr(l.deductions)}</TableCell>
                    <TableCell className="text-right font-semibold">{inr(l.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
