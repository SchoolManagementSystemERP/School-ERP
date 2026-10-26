import { useState } from "react";
import { Check, Receipt, X } from "lucide-react";
import { api } from "@/api/client";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/components/ui/utils";
import { fmtDate, rupees } from "@/lib/format";
import { act, useApi } from "@/lib/useApi";
import { CheckCircle2, Clock, Wallet } from "lucide-react";

export interface Claim {
  id: string; staffId: string; staffName: string; employeeCode: string; claimNo: string; date: string; category: string; description: string; amount: number;
  receiptName: string | null; status: "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID"; decidedAt: string | null; remark: string | null; paidMonth: string | null; createdAt: string;
}

export const CLAIM_STATUS: Record<Claim["status"], { label: string; className: string }> = {
  SUBMITTED: { label: "Waiting for approval", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  APPROVED: { label: "Approved — paid with salary", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  REJECTED: { label: "Rejected", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  PAID: { label: "Paid", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

/** Expense claims of the school's staff: approve or reject; approved claims are paid with the next salary. */
export function ExpenseClaims() {
  const { data, reload } = useApi<Claim[]>("/expense-claims");
  const [filter, setFilter] = useState<"SUBMITTED" | "all">("SUBMITTED");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const claims = (data ?? []).filter((c) => filter === "all" || c.status === filter);
  const waiting = (data ?? []).filter((c) => c.status === "SUBMITTED");
  const approvedUnpaid = (data ?? []).filter((c) => c.status === "APPROVED");

  const decide = async (c: Claim, status: "APPROVED" | "REJECTED") => {
    const ok = await act(() => api.patch(`/expense-claims/${c.id}`, { status, remark: remarks[c.id] || undefined }), status === "APPROVED" ? `${c.claimNo} approved` : `${c.claimNo} rejected`);
    if (ok) void reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Expense Claims" description="Reimbursements claimed by staff. Approved claims are added to the next payroll (or the full & final)."
        actions={
          <Select value={filter} onValueChange={(v) => setFilter(v as "SUBMITTED" | "all")}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="SUBMITTED">Waiting for approval</SelectItem><SelectItem value="all">All claims</SelectItem></SelectContent>
          </Select>
        } />
      <MiniStats items={[
        { label: "Waiting", value: `${waiting.length} · ${rupees(waiting.reduce((t, c) => t + c.amount, 0))}`, icon: Clock, tone: "amber" },
        { label: "To pay with salary", value: rupees(approvedUnpaid.reduce((t, c) => t + c.amount, 0)), icon: Wallet, tone: "blue" },
        { label: "Paid this year", value: rupees((data ?? []).filter((c) => c.status === "PAID").reduce((t, c) => t + c.amount, 0)), icon: CheckCircle2, tone: "green" },
      ]} />
      <div className="space-y-3">
        {claims.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{filter === "SUBMITTED" ? "No claims are waiting." : "No claims yet."}</CardContent></Card>}
        {claims.map((c) => (
          <Card key={c.id} className="gap-0">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{c.staffName} <span className="font-normal text-muted-foreground">· {c.employeeCode}</span></p>
                  <Badge variant="secondary" className={cn(CLAIM_STATUS[c.status].className)}>{CLAIM_STATUS[c.status].label}{c.status === "PAID" && c.paidMonth ? ` (${c.paidMonth === "FNF" ? "F&F" : c.paidMonth})` : ""}</Badge>
                </div>
                <p className="mt-1 text-sm text-foreground">{c.category}: {c.description}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{c.claimNo}</span><span>· spent {fmtDate(c.date)}</span>
                  {c.receiptName && <span className="inline-flex items-center gap-1">· <Receipt className="h-3 w-3" /> {c.receiptName}</span>}
                  {c.remark && <span>· “{c.remark}”</span>}
                </p>
              </div>
              <p className="font-display text-xl font-semibold tabular-nums text-foreground lg:w-28 lg:text-right">{rupees(c.amount)}</p>
              {c.status === "SUBMITTED" && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input placeholder="Remark (needed to reject)" value={remarks[c.id] ?? ""} onChange={(e) => setRemarks({ ...remarks, [c.id]: e.target.value })} className="h-9 sm:w-56" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => decide(c, "REJECTED")}><X className="h-4 w-4" /> Reject</Button>
                    <Button size="sm" className="gap-1" onClick={() => decide(c, "APPROVED")}><Check className="h-4 w-4" /> Approve</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
