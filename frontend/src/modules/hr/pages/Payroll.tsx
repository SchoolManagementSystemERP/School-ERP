import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Download, FileText, Landmark, Play, Users, Wallet } from "lucide-react";
import { Link, useLocation } from "react-router";
import { toast } from "sonner";
import { api, errorMessage } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { PayslipDialog } from "@/components/hr/PayslipDialog";
import { StatCard } from "@/components/common/StatCard";
import { inr, monthLabel, monthOf } from "@/store/finance";
import { createStaffAdvance, markPayrollPaid, processPayroll, usePayroll, useStaff, useStaffAdvances } from "@/store/hr";
import { downloadCsv } from "@/store/inventory";
import { useTeachers } from "@/store/teachers";
import { canAny } from "@/store/auth";

/** Monthly salary processing — shared by the HR and Accounts portals. */
export function Payroll() {
  const runs = usePayroll();
  const advances = useStaffAdvances();
  const { teachers } = useTeachers();
  const staff = useStaff();
  const canManageAdvances = canAny("payroll.run");
  const canExportBankFile = canAny("payroll.run") && canAny("staff.write");
  const current = monthOf();
  const [month, setMonth] = useState(runs.some((r) => r.month === current) ? current : runs.at(-1)?.month ?? current);
  const run = runs.find((r) => r.month === month);
  const [slip, setSlip] = useState<string | null>(null);
  const [advanceForm, setAdvanceForm] = useState({
    staffId: "", principalAmount: "", installmentAmount: "", startMonth: monthOf(), purpose: "", disbursedMethod: "BANK_TRANSFER" as "BANK_TRANSFER" | "CASH",
  });
  // the page is shared by the HR and Accounts portals
  const base = "/" + (useLocation().pathname.split("/")[1] || "hr");
  const months = [...new Set([...runs.map((r) => r.month), current])].sort().reverse();

  const gross = run?.lines.reduce((a, l) => a + l.gross, 0) ?? 0;
  const deductions = run?.lines.reduce((a, l) => a + l.deductions, 0) ?? 0;
  const net = gross - deductions;

  const process = () => {
    processPayroll(month);
    toast.success(`Payroll processed for ${monthLabel(month)}`);
  };
  const employees = [
    ...teachers.filter((person) => person.status === "Active" || person.status === "On Leave")
      .map((person) => ({ id: person.id, employeeCode: person.empId, name: person.name })),
    ...staff.filter((person) => person.status === "Active" || person.status === "On Leave")
      .map((person) => ({ id: person.id, employeeCode: person.empId, name: person.name })),
  ];
  const saveAdvance = async () => {
    const principalAmount = Number(advanceForm.principalAmount);
    const installmentAmount = Number(advanceForm.installmentAmount);
    const staffId = Number(advanceForm.staffId);
    if (!staffId || !Number.isFinite(principalAmount) || principalAmount <= 0
      || !Number.isFinite(installmentAmount) || installmentAmount <= 0 || installmentAmount > principalAmount
      || !advanceForm.startMonth || !advanceForm.purpose.trim()) {
      toast.error("Choose an employee and enter valid advance, EMI, start month and purpose.");
      return;
    }
    try {
      await createStaffAdvance({
        staffId, principalAmount, installmentAmount,
        startMonth: advanceForm.startMonth, purpose: advanceForm.purpose.trim(),
        disbursedMethod: advanceForm.disbursedMethod,
      });
      setAdvanceForm((current) => ({ ...current, staffId: "", principalAmount: "", installmentAmount: "", purpose: "" }));
      toast.success("Salary advance recorded and posted to the ledger");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the salary advance");
    }
  };
  const exportBankFile = async () => {
    try {
      const payees = await api.get<{ employeeCode: string; name: string; accountNo: string; ifsc: string; amount: number }[]>(`/payroll/${month}/bank-transfer`);
      downloadCsv(`payroll-neft-${month}.csv`, ["Employee Code", "Beneficiary Name", "Account Number", "IFSC", "Amount INR", "Narration"], payees.map((payee) => [
        payee.employeeCode, payee.name, payee.accountNo, payee.ifsc, payee.amount, `Salary ${month}`,
      ]));
      toast.success(`NEFT transfer sheet exported for ${payees.length} employees`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Monthly salaries from each employee's structure — loss of pay from the attendance register, approved expense claims added, PF / ESI / PT / TDS deducted"
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
        <CardHeader><CardTitle className="text-base">Staff advances and EMI recovery</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {canManageAdvances && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Employee</Label>
                <Select value={advanceForm.staffId} onValueChange={(staffId) => setAdvanceForm((current) => ({ ...current, staffId }))}>
                  <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                  <SelectContent>{employees.map((person) => <SelectItem key={person.id} value={String(person.id)}>{person.employeeCode} · {person.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Advance amount (INR)</Label><Input type="number" min="0.01" step="0.01" value={advanceForm.principalAmount} onChange={(event) => setAdvanceForm((current) => ({ ...current, principalAmount: event.target.value }))} /></div>
              <div className="space-y-1"><Label>Monthly EMI (INR)</Label><Input type="number" min="0.01" step="0.01" value={advanceForm.installmentAmount} onChange={(event) => setAdvanceForm((current) => ({ ...current, installmentAmount: event.target.value }))} /></div>
              <div className="space-y-1"><Label>First deduction month</Label><Input type="month" value={advanceForm.startMonth} onChange={(event) => setAdvanceForm((current) => ({ ...current, startMonth: event.target.value }))} /></div>
              <div className="space-y-1"><Label>Disbursement mode</Label>
                <Select value={advanceForm.disbursedMethod} onValueChange={(disbursedMethod: "BANK_TRANSFER" | "CASH") => setAdvanceForm((current) => ({ ...current, disbursedMethod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem><SelectItem value="CASH">Cash</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Purpose</Label><Input maxLength={300} value={advanceForm.purpose} onChange={(event) => setAdvanceForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="Reason for salary advance" /></div>
              <div className="md:col-span-3"><Button onClick={() => void saveAdvance()}>Record advance</Button></div>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Purpose</TableHead><TableHead>Principal</TableHead><TableHead>Monthly EMI</TableHead><TableHead>Outstanding</TableHead><TableHead>Starts</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{advances.map((advance) => <TableRow key={advance.id}>
                <TableCell>{advance.employeeCode} · {advance.staffName}</TableCell><TableCell>{advance.purpose}</TableCell>
                <TableCell>{inr(advance.principalAmount)}</TableCell><TableCell>{inr(advance.installmentAmount)}</TableCell>
                <TableCell>{inr(advance.outstandingAmount)}</TableCell><TableCell>{advance.startMonth}</TableCell>
                <TableCell><Badge variant={advance.status === "ACTIVE" ? "default" : "secondary"}>{advance.status}</Badge></TableCell>
              </TableRow>)}
              {!advances.length && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No salary advances recorded.</TableCell></TableRow>}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{monthLabel(month)}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {run && (
              <Button variant="outline" size="sm" className="gap-1" asChild><Link to={`${base}/compliance?month=${month}`}><Landmark className="h-4 w-4" /> PF / ESI / TDS</Link></Button>
            )}
            {run && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => downloadCsv(`payroll-${month}.csv`, ["Emp ID", "Name", "Designation", "Gross", "Deductions", "Net"], run.lines.map((l) => [l.empId, l.name, l.designation, l.gross, l.deductions, l.net]))}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            )}
            {run && canExportBankFile && (
              <Button variant="outline" size="sm" className="gap-1" onClick={() => void exportBankFile()}>
                <Download className="h-4 w-4" /> NEFT transfer CSV
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
                  <TableHead />
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
                    <TableCell className="text-right">{l.payslipId && <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setSlip(l.payslipId!)}><FileText className="h-3.5 w-3.5" /> Payslip</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {slip && <PayslipDialog id={slip} onClose={() => setSlip(null)} />}
    </div>
  );
}
