import { useState } from "react";
import { CheckCircle2, Circle, ShieldAlert, ShieldCheck, UserPlus } from "lucide-react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/components/ui/utils";
import { fmtDate } from "@/lib/format";
import { act, useApi } from "@/lib/useApi";

interface Task { id: string; key: string; title: string; category: string; done: boolean; doneAt: string | null; note: string | null }
interface Joiner {
  staffId: string; name: string; employeeCode: string; designation: string; department: string | null; staffType: string; joiningDate: string | null;
  bgvStatus: string | null; hasLogin: boolean; status: string; done: number; total: number; tasks: Task[];
}

const CATEGORY: Record<string, string> = { DOCUMENTS: "Documents", VERIFICATION: "Verification", ACCOUNTS: "Accounts & ID", PAYROLL: "Payroll", INDUCTION: "Induction", OTHER: "Other" };
const BGV: Record<string, { label: string; className: string }> = {
  PENDING: { label: "BGV pending", className: "bg-muted text-muted-foreground" },
  IN_PROGRESS: { label: "BGV in progress", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  CLEAR: { label: "BGV clear", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  FLAGGED: { label: "BGV flagged", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
};

/** Joining formalities of new employees: documents, verification, accounts, payroll enrolment, induction. */
export function Onboarding() {
  const { data, loading, reload, setData } = useApi<Joiner[]>("/onboarding");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const list = (data ?? []).filter((j) => filter === "all" || j.done < j.total);

  const toggle = async (j: Joiner, t: Task) => {
    // optimistic tick
    setData((d) => d?.map((x) => (x.staffId !== j.staffId ? x : { ...x, done: x.done + (t.done ? -1 : 1), tasks: x.tasks.map((y) => (y.id === t.id ? { ...y, done: !t.done } : y)) })) ?? null);
    const ok = await act(() => api.patch(`/onboarding/${t.id}`, { done: !t.done }));
    if (!ok) void reload();
  };
  const setBgv = async (j: Joiner, status: string) => {
    if (await act(() => api.patch(`/staff/${j.staffId}/bgv`, { status }), `Background verification: ${BGV[status].label.replace("BGV ", "")}`)) void reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        description="Joining formalities of new employees — documents, background check, sign-in, payroll enrolment and induction."
        actions={
          <Select value={filter} onValueChange={(v) => setFilter(v as "open" | "all")}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="open">In progress</SelectItem><SelectItem value="all">Everyone</SelectItem></SelectContent>
          </Select>
        }
      />

      {!loading && list.length === 0 && (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <UserPlus className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">{filter === "open" ? "Nobody is waiting on joining formalities" : "No onboarding records yet"}</p>
          <p className="text-sm text-muted-foreground">New hires appear here when a candidate joins from an accepted offer (Recruitment → Offers).</p>
        </CardContent></Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {list.map((j) => {
          const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
          const bgv = BGV[j.bgvStatus ?? "PENDING"];
          const groups = Object.keys(CATEGORY).filter((c) => j.tasks.some((t) => t.category === c));
          return (
            <Card key={j.staffId} className="gap-0">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{j.name} <span className="font-normal text-muted-foreground">· {j.employeeCode}</span></CardTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">{j.designation}{j.department ? ` · ${j.department}` : ""}{j.joiningDate ? ` · joined ${fmtDate(j.joiningDate)}` : ""}</p>
                  </div>
                  <Badge variant="secondary" className={cn("shrink-0", bgv.className)}>{bgv.label}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
                  <span className="text-xs tabular-nums text-muted-foreground">{j.done}/{j.total}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY[g]}</p>
                    <ul className="space-y-1">
                      {j.tasks.filter((t) => t.category === g).map((t) => (
                        <li key={t.id}>
                          <button type="button" onClick={() => toggle(j, t)} className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent">
                            {t.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                            <span className={cn("flex-1", t.done && "text-muted-foreground line-through")}>{t.title}{t.note ? <span className="ml-1 text-xs no-underline"> — {t.note}</span> : null}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">Background check:</span>
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setBgv(j, "IN_PROGRESS")}>Started</Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-emerald-700 dark:text-emerald-300" onClick={() => setBgv(j, "CLEAR")}><ShieldCheck className="h-3.5 w-3.5" /> Clear</Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-red-700 dark:text-red-300" onClick={() => setBgv(j, "FLAGGED")}><ShieldAlert className="h-3.5 w-3.5" /> Flag</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
