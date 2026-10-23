import { useState } from "react";
import { CheckCircle2, Clock, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import {
  INDENT_STATUS_LABEL, inr, managementDecision, principalDecision, purchaseEstimate, updateProcurementSettings, useIndents, useProcurementSettings,
  type IndentStatus, type ProcurementSettings,
} from "@/store/procurement";
import { ErrorText, IndentCard, useAction } from "../components";
import { authStore } from "@/store/auth";

function LimitsCard() {
  const saved = useProcurementSettings();
  const [d, setD] = useState<ProcurementSettings>(saved);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const num = (k: keyof ProcurementSettings) => (e: { target: { value: string } }) => setD({ ...d, [k]: Math.max(0, Number(e.target.value)) });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Approval rules</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2"><Label>Principal approves up to (₹)</Label><Input type="number" value={d.principalLimit} onChange={num("principalLimit")} /></div>
        <div className="space-y-2"><Label>Quotations needed from (₹)</Label><Input type="number" value={d.quotationThreshold} onChange={num("quotationThreshold")} /></div>
        <div className="space-y-2"><Label>Number of quotations</Label><Input type="number" min={1} max={5} value={d.minQuotations} onChange={num("minQuotations")} /></div>
        <div className="space-y-2"><Label>Petty cash float (₹)</Label><Input type="number" value={d.pettyCashFloat} onChange={num("pettyCashFloat")} /></div>
        <div className="space-y-2"><Label>Petty cash per voucher (₹)</Label><Input type="number" value={d.pettyCashVoucherLimit} onChange={num("pettyCashVoucherLimit")} /></div>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
          <Button size="sm" className="gap-2" disabled={!dirty} onClick={() => updateProcurementSettings({ ...d, minQuotations: Math.max(1, Math.round(d.minQuotations)) }).then(() => toast.success("Approval rules saved"), (e: Error) => toast.error(e.message))}><Save className="h-4 w-4" />Save rules</Button>
          <p className="text-xs text-muted-foreground">Purchases above {inr(d.principalLimit)} need Management approval after the Principal.</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Principal (`level="principal"`) or Management (`level="management"`) purchase approvals. */
export function PurchaseApprovals({ level }: { level: "principal" | "management" }) {
  const indents = useIndents();
  const settings = useProcurementSettings();
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<IndentStatus | "open" | "all">("open");
  const { error, run } = useAction();
  const waitingStatus: IndentStatus = level === "principal" ? "PENDING_PRINCIPAL" : "PENDING_MANAGEMENT";
  const actor = level === "principal" ? { role: "principal", name: authStore.get().me?.user.name ?? "Principal" } : { role: "admin", name: "Management" };
  const decide = level === "principal" ? principalDecision : managementDecision;
  const pending = indents.filter((i) => i.status === waitingStatus);
  const closed = ["COMPLETED", "REJECTED", "CANCELLED"];
  const tracked = indents.filter((i) => (filter === "all" ? true : filter === "open" ? !closed.includes(i.status) : i.status === filter));
  const monthApproved = indents.filter((i) => i.history.some((h) => h.role === (level === "principal" ? "Principal" : "Management") && h.action === "Approved" && h.at.slice(0, 7) === new Date().toISOString().slice(0, 7)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={level === "principal" ? "Purchase approvals" : "Management approvals"}
        description={level === "principal" ? `Requisitions the store could not fill from stock. You approve up to ${inr(settings.principalLimit)}; above that they go to Management.` : `Purchases above ${inr(settings.principalLimit)}, already approved by the Principal.`}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Waiting for you" value={pending.length} icon={Clock} tone="amber" hint={inr(pending.reduce((s, i) => s + purchaseEstimate(i), 0))} />
        <StatCard label="Approved this month" value={monthApproved.length} icon={CheckCircle2} tone="green" hint={inr(monthApproved.reduce((s, i) => s + purchaseEstimate(i), 0))} />
        <StatCard label="Rejected (all time)" value={indents.filter((i) => i.status === "REJECTED").length} icon={XCircle} tone="red" />
      </div>

      {level === "management" && <LimitsCard />}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Waiting for you ({pending.length})</TabsTrigger>
          <TabsTrigger value="all">All requisitions</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4 space-y-3">
          <ErrorText error={error} />
          {pending.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nothing waiting for your approval.</CardContent></Card>}
          {pending.map((i) => {
            const est = purchaseEstimate(i);
            const willEscalate = level === "principal" && est > settings.principalLimit;
            return (
              <IndentCard
                key={i.id}
                indent={i}
                defaultOpen
                actions={
                  <div className="space-y-2">
                    {willEscalate && <p className="text-sm text-amber-700 dark:text-amber-300">{inr(est)} is above your limit of {inr(settings.principalLimit)} — approving forwards it to Management.</p>}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input placeholder="Remark (required to reject)" value={remarks[i.id] ?? ""} onChange={(e) => setRemarks({ ...remarks, [i.id]: e.target.value })} aria-label="Remark" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => run(() => decide(i.id, actor, true, remarks[i.id] ?? ""), () => toast.success(willEscalate ? `${i.no} approved and sent to Management` : `${i.no} approved — the store will get quotations`))}>{willEscalate ? "Approve & forward" : "Approve purchase"}</Button>
                        <Button size="sm" variant="outline" onClick={() => run(() => decide(i.id, actor, false, remarks[i.id] ?? ""), () => toast.success(`${i.no} rejected`))}>Reject</Button>
                      </div>
                    </div>
                  </div>
                }
              />
            );
          })}
        </TabsContent>
        <TabsContent value="all" className="mt-4 space-y-3">
          <Select value={filter} onValueChange={(v: typeof filter) => setFilter(v)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open (in progress)</SelectItem>
              <SelectItem value="all">All</SelectItem>
              {(Object.keys(INDENT_STATUS_LABEL) as IndentStatus[]).map((s) => <SelectItem key={s} value={s}>{INDENT_STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {tracked.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No requisitions.</CardContent></Card>}
          {tracked.map((i) => <IndentCard key={i.id} indent={i} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const PrincipalPurchaseApprovals = () => <PurchaseApprovals level="principal" />;
export const ManagementPurchaseApprovals = () => <PurchaseApprovals level="management" />;
