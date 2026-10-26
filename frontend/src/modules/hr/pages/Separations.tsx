import { useState } from "react";
import { Calculator, CheckCircle2, Circle, DoorOpen, Plus, Send, UserMinus } from "lucide-react";
import { api } from "@/api/client";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { ExitDocuments, ExitInterviewForm, FnfStatement, SEPARATION_STATUS, SEPARATION_TYPE, type Separation } from "@/components/hr/exit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import { today } from "@/lib/dates";
import { fmtDate, rupees } from "@/lib/format";
import { act, useApi } from "@/lib/useApi";
import { Clock, Wallet } from "lucide-react";

interface StaffLite { id: string; name: string; employeeCode: string; designation: string }

/** Exit formalities: acceptance, exit interview, handover, full & final (to Accounts) and the exit letters. */
export function Separations() {
  const { data, reload } = useApi<Separation[]>("/separations");
  const staff = useApi<StaffLite[]>("/staff").data ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [create, setCreate] = useState<null | { staffId: string; type: Separation["type"]; reason: string; lastWorkingDay: string }>(null);
  const list = (data ?? []).filter((s) => filter === "all" || ["REQUESTED", "ACCEPTED", "CLEARANCE"].includes(s.status));
  const open = data?.find((s) => s.id === openId) ?? null;

  const record = async () => {
    if (!create) return;
    if (await act(() => api.post("/separations", { ...create, lastWorkingDay: create.lastWorkingDay || undefined }), "Separation recorded")) { setCreate(null); void reload(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Exits & Full and Final" description="Resignations and separations — acceptance, exit interview, handover, F&F settlement (sent to Accounts) and the exit letters."
        actions={
          <div className="flex gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as "open" | "all")}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">In progress</SelectItem><SelectItem value="all">All exits</SelectItem></SelectContent></Select>
            <Button className="gap-2" onClick={() => setCreate({ staffId: "", type: "TERMINATION", reason: "", lastWorkingDay: "" })}><Plus className="h-4 w-4" /> Record separation</Button>
          </div>
        } />
      <MiniStats items={[
        { label: "Resignations to accept", value: (data ?? []).filter((s) => s.status === "REQUESTED").length, icon: Clock, tone: "amber" },
        { label: "Serving notice / clearance", value: (data ?? []).filter((s) => s.status === "ACCEPTED" || s.status === "CLEARANCE").length, icon: DoorOpen, tone: "blue" },
        { label: "F&F paid this year", value: rupees((data ?? []).filter((s) => s.status === "SETTLED").reduce((t, s) => t + Math.max(0, s.fnf?.net ?? 0), 0)), icon: Wallet, tone: "green" },
      ]} />

      <div className="space-y-3">
        {list.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No exits {filter === "open" ? "in progress" : "yet"}.</CardContent></Card>}
        {list.map((s) => {
          const done = s.handover.filter((h) => h.done).length;
          return (
            <Card key={s.id} className="gap-0">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{s.staff?.name} <span className="font-normal text-muted-foreground">· {s.staff?.employeeCode}</span></p>
                    <Badge variant="outline">{SEPARATION_TYPE[s.type]}</Badge>
                    <Badge variant="secondary" className={SEPARATION_STATUS[s.status].className}>{SEPARATION_STATUS[s.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.staff?.designation} · notice {fmtDate(s.noticeDate)} · last day <strong className="text-foreground">{fmtDate(s.lastWorkingDay)}</strong></p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.reason}{s.handover.length ? ` · handover ${done}/${s.handover.length}` : ""}{s.exitInterview ? " · exit interview done" : ""}{s.fnf ? ` · F&F ${rupees(s.fnf.net)}` : ""}
                  </p>
                </div>
                <Button size="sm" onClick={() => setOpenId(s.id)}>Open</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {open && <SeparationDialog key={`${open.id}-${open.status}`} s={open} onClose={() => setOpenId(null)} onChange={() => void reload()} />}

      <Dialog open={!!create} onOpenChange={(o) => !o && setCreate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record a separation</DialogTitle></DialogHeader>
          {create && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Employees resign from their own portal (My Exit). Use this for terminations, retirements and contract ends, or to record a resignation on someone's behalf.</p>
              <div className="space-y-1.5"><Label>Employee</Label>
                <Select value={create.staffId} onValueChange={(v) => setCreate({ ...create, staffId: v })}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.employeeCode}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={create.type} onValueChange={(v) => setCreate({ ...create, type: v as Separation["type"] })}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SEPARATION_TYPE).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Last working day</Label><Input type="date" min={today()} value={create.lastWorkingDay} onChange={(e) => setCreate({ ...create, lastWorkingDay: e.target.value })} /><p className="text-xs text-muted-foreground">Leave empty for the notice period from HR Settings.</p></div>
              <div className="space-y-1.5"><Label>Reason</Label><Textarea rows={2} value={create.reason} onChange={(e) => setCreate({ ...create, reason: e.target.value })} /></div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreate(null)}>Cancel</Button><Button disabled={!create.staffId || create.reason.trim().length < 3} onClick={record}>Record</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeparationDialog({ s, onClose, onChange }: { s: Separation; onClose: () => void; onChange: () => void }) {
  const [lwd, setLwd] = useState(s.lastWorkingDay);
  const [remark, setRemark] = useState("");
  const [handover, setHandover] = useState(s.handover);
  const [newItem, setNewItem] = useState("");
  const [adj, setAdj] = useState({ bonus: "", noticeRecovery: "", otherEarnings: "", otherDeductions: "", remarks: s.fnf?.remarks ?? "" });
  const active = s.status === "ACCEPTED" || s.status === "CLEARANCE";

  const patch = async (action: "ACCEPT" | "REJECT" | "WITHDRAW", msg: string) => {
    if (await act(() => api.patch(`/separations/${s.id}`, { action, ...(action === "ACCEPT" ? { lastWorkingDay: lwd } : {}), ...(remark ? { remark } : {}) }), msg)) onChange();
  };
  const saveHandover = async (items = handover) => { if (await act(() => api.put(`/separations/${s.id}/handover`, { items }))) onChange(); };
  const toggle = (i: number) => { const items = handover.map((h, k) => (k === i ? { ...h, done: !h.done } : h)); setHandover(items); void saveHandover(items); };
  const calc = async () => {
    const n = (v: string) => (v === "" ? undefined : Number(v));
    const body = { bonus: n(adj.bonus), noticeRecovery: n(adj.noticeRecovery), otherEarnings: n(adj.otherEarnings), otherDeductions: n(adj.otherDeductions), remarks: adj.remarks || undefined };
    if (await act(() => api.post(`/separations/${s.id}/fnf`, body), "Full & final calculated")) onChange();
  };
  const settle = async () => { if (await act(() => api.post(`/separations/${s.id}/settle`, {}), "Settled — the payable is with Accounts and the sign-in is closed")) onChange(); };
  const canSettle = s.status === "CLEARANCE" && !!s.fnf && s.lastWorkingDay <= today() && handover.every((h) => h.done);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{s.staff?.name} — {SEPARATION_TYPE[s.type]}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className={SEPARATION_STATUS[s.status].className}>{SEPARATION_STATUS[s.status].label}</Badge>
          <span className="text-muted-foreground">Notice {fmtDate(s.noticeDate)} · last day {fmtDate(s.lastWorkingDay)}</span>
        </div>
        {s.letter && <blockquote className="whitespace-pre-line rounded-lg border-l-4 border-primary/40 bg-muted/40 p-3 text-sm italic text-foreground/90">{s.letter}</blockquote>}

        {s.status === "REQUESTED" && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-semibold">Decision</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Last working day</Label><Input type="date" min={s.noticeDate} value={lwd} onChange={(e) => setLwd(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Remark (needed to reject)</Label><Input value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => patch("REJECT", "Resignation not accepted")} disabled={!remark.trim()}>Reject</Button>
              <Button onClick={() => patch("ACCEPT", "Resignation accepted")}>Accept</Button>
            </div>
          </div>
        )}

        {(active || s.status === "SETTLED") && (
          <Tabs defaultValue={s.status === "SETTLED" ? "fnf" : "handover"}>
            <TabsList><TabsTrigger value="handover">Handover</TabsTrigger><TabsTrigger value="interview">Exit interview</TabsTrigger><TabsTrigger value="fnf">Full & final</TabsTrigger><TabsTrigger value="letters">Letters</TabsTrigger></TabsList>
            <TabsContent value="handover" className="space-y-2">
              {handover.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button type="button" disabled={!active} onClick={() => toggle(i)} className="flex flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent">
                    {h.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className={cn(h.done && "text-muted-foreground line-through")}>{h.item}</span>
                  </button>
                  <Input className="h-8 w-40" placeholder="Handed to" disabled={!active} value={h.owner} onChange={(e) => setHandover(handover.map((x, k) => (k === i ? { ...x, owner: e.target.value } : x)))} onBlur={() => saveHandover()} />
                </div>
              ))}
              {active && (
                <div className="flex gap-2 pt-1">
                  <Input className="h-8" placeholder="Add an item (e.g. laptop returned)" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={newItem.trim().length < 2} onClick={() => { const items = [...handover, { item: newItem.trim(), owner: "", done: false }]; setHandover(items); setNewItem(""); void saveHandover(items); }}>Add</Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="interview">
              {active ? <ExitInterviewForm id={s.id} initial={s.exitInterview} onSaved={onChange} />
                : s.exitInterview ? <p className="text-sm">Reason: {s.exitInterview.primaryReason} · recommend: {s.exitInterview.wouldRecommend ? "yes" : "no"} · rejoin: {s.exitInterview.wouldRejoin ? "yes" : "no"}</p>
                : <p className="text-sm text-muted-foreground">Not recorded.</p>}
            </TabsContent>
            <TabsContent value="fnf" className="space-y-3">
              {s.fnf ? <FnfStatement f={s.fnf} /> : <p className="text-sm text-muted-foreground">Not calculated yet. It includes salary for the last month, earned-leave encashment, bonus, gratuity, unpaid claims and notice recovery.</p>}
              {active && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Leave a field empty to use the calculated amount.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([["bonus", "Bonus"], ["noticeRecovery", "Notice recovery"], ["otherEarnings", "Other earnings"], ["otherDeductions", "Other recoveries"]] as const).map(([k, l]) => (
                      <div key={k} className="space-y-1"><Label className="text-xs">{l} (₹)</Label><Input className="h-8" type="number" min={0} value={adj[k]} onChange={(e) => setAdj({ ...adj, [k]: e.target.value })} /></div>
                    ))}
                  </div>
                  <Input className="h-8" placeholder="Remarks (e.g. laptop not returned — ₹8,000 recovered)" value={adj.remarks} onChange={(e) => setAdj({ ...adj, remarks: e.target.value })} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" className="gap-1" onClick={calc}><Calculator className="h-4 w-4" /> {s.fnf ? "Recalculate" : "Calculate F&F"}</Button>
                    <Button size="sm" className="gap-1" disabled={!canSettle} onClick={settle}><Send className="h-4 w-4" /> Settle & send to Accounts</Button>
                  </div>
                  {s.status === "CLEARANCE" && !canSettle && (
                    <p className="text-right text-xs text-muted-foreground">{s.lastWorkingDay > today() ? `Settle on or after ${fmtDate(s.lastWorkingDay)}.` : "Finish the handover checklist to settle."}</p>
                  )}
                </div>
              )}
              {s.status === "SETTLED" && <p className="text-sm text-emerald-700 dark:text-emerald-300">Settled on {fmtDate(s.settledAt!.slice(0, 10))}{s.sentToAccounts ? " — recorded in Accounts as an expense “Full & Final Settlement”." : "."}</p>}
            </TabsContent>
            <TabsContent value="letters"><ExitDocuments id={s.id} /></TabsContent>
          </Tabs>
        )}

        {active && (
          <div className="flex justify-start border-t border-border pt-3">
            <Button size="sm" variant="ghost" className="gap-1 text-red-600" onClick={() => patch("WITHDRAW", "Exit withdrawn — the employee stays")}><UserMinus className="h-4 w-4" /> Withdraw exit</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
