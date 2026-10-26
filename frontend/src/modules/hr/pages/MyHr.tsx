import { useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarCheck, DoorOpen, FileText, GraduationCap, Plus, Presentation, Receipt, Star } from "lucide-react";
import { api } from "@/api/client";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { ExitDocuments, ExitInterviewForm, FnfStatement, SEPARATION_STATUS, type Separation } from "@/components/hr/exit";
import { monthLabel } from "@/components/hr/hrDocs";
import { PayslipDialog } from "@/components/hr/PayslipDialog";
import { CATEGORY_LABEL, SlideViewer, TestRunner, TRAINING_STATUS, type TrainingDetail, type TrainingSummary } from "@/components/hr/training";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CLAIM_STATUS, type Claim } from "./ExpenseClaims";
import { CheckCircle2, Clock, Wallet } from "lucide-react";

interface Slip { id: string; month: string; status: string; paidAt: string | null; gross: number; deductions: number; net: number }
interface MyAttendance { month: string; lopDays: number; days: { date: string; status: string; inTime: string | null; outTime: string | null }[] }
interface Balance { staffId: string; balances: { type: string; entitled: number; taken: number; balance: number }[] }

const TABS = ["payslips", "attendance", "claims", "trainings", "exit"] as const;

/** Employee self-service: payslips, attendance & leave balance, expense claims, trainings and resignation. */
export function MyHr() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab") as (typeof TABS)[number]) ? params.get("tab")! : "payslips";
  // the payslip list doubles as the check that this sign-in belongs to an employee
  const slips = useApi<Slip[]>("/me/payslips");
  return (
    <div className="space-y-6">
      <PageHeader title="My HR" description="Your payslips, attendance, claims, trainings and exit — in one place." />
      {slips.error ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Your sign-in is not linked to an employee record, so there are no payslips or HR records to show. Ask HR to link it from the Staff Directory.</CardContent></Card>
      ) : (
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="payslips" className="gap-1.5"><FileText className="h-4 w-4" /> Payslips</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><CalendarCheck className="h-4 w-4" /> Attendance & leave</TabsTrigger>
          <TabsTrigger value="claims" className="gap-1.5"><Receipt className="h-4 w-4" /> Expense claims</TabsTrigger>
          <TabsTrigger value="trainings" className="gap-1.5"><GraduationCap className="h-4 w-4" /> Trainings</TabsTrigger>
          <TabsTrigger value="exit" className="gap-1.5"><DoorOpen className="h-4 w-4" /> Resignation</TabsTrigger>
        </TabsList>
        <TabsContent value="payslips"><MyPayslips slips={slips.data} loading={slips.loading} /></TabsContent>
        <TabsContent value="attendance"><MyAttendanceTab /></TabsContent>
        <TabsContent value="claims"><MyClaims /></TabsContent>
        <TabsContent value="trainings"><MyTrainings /></TabsContent>
        <TabsContent value="exit"><MyExit /></TabsContent>
      </Tabs>
      )}
    </div>
  );
}

function MyPayslips({ slips: data, loading }: { slips: Slip[] | null; loading: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const slips = data ?? [];
  return (
    <div className="space-y-3">
      {!loading && slips.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No payslips yet. They appear here after the monthly payroll is processed.</CardContent></Card>}
      {slips.map((p) => (
        <Card key={p.id} className="gap-0">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{monthLabel(p.month)}</p>
              <p className="text-xs text-muted-foreground">Gross {rupees(p.gross)} · deductions {rupees(p.deductions)} · {p.paidAt ? `paid ${fmtDate(p.paidAt)}` : "processing"}</p>
            </div>
            <p className="font-display text-lg font-semibold tabular-nums">{rupees(p.net)}</p>
            <Button size="sm" variant="outline" onClick={() => setOpen(p.id)}>View</Button>
          </CardContent>
        </Card>
      ))}
      {open && <PayslipDialog id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const DAY_STYLE: Record<string, string> = { PRESENT: "bg-emerald-500 text-white", ABSENT: "bg-red-500 text-white", HALF_DAY: "bg-amber-500 text-white", LEAVE: "bg-blue-500 text-white", HOLIDAY: "bg-slate-500 text-white", WEEK_OFF: "bg-slate-400 text-white" };
const DAY_SHORT: Record<string, string> = { PRESENT: "P", ABSENT: "A", HALF_DAY: "½", LEAVE: "L", HOLIDAY: "H", WEEK_OFF: "W" };

function MyAttendanceTab() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const { data } = useApi<MyAttendance>(`/me/attendance?month=${month}`);
  const balances = useApi<Balance[]>("/leave-balances?mine=1").data?.[0]?.balances ?? [];
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const firstDow = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).getDay();
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
  const count = (s: string) => (data?.days ?? []).filter((d) => d.status === s).length;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="gap-0 xl:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">My register</CardTitle>
          <Input type="month" className="h-9 w-40" max={today().slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d} className="text-muted-foreground">{d}</span>)}
            {Array.from({ length: firstDow }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              const d = byDate.get(date);
              return (
                <div key={date} title={d ? `${d.status}${d.inTime ? ` ${d.inTime}–${d.outTime ?? ""}` : ""}` : undefined} className={cn("flex aspect-square flex-col sm:aspect-auto sm:h-12 items-center justify-center rounded-md border border-border", d && DAY_STYLE[d.status], d && "border-transparent")}>
                  <span className="font-medium">{i + 1}</span>
                  {d && <span className="text-[10px]">{DAY_SHORT[d.status]}</span>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1">Present <strong>{count("PRESENT")}</strong></span>
            <span className="rounded-full bg-muted px-2.5 py-1">Half day <strong>{count("HALF_DAY")}</strong></span>
            <span className="rounded-full bg-muted px-2.5 py-1">Leave <strong>{count("LEAVE")}</strong></span>
            <span className="rounded-full bg-muted px-2.5 py-1">Absent <strong>{count("ABSENT")}</strong></span>
            {!!data?.lopDays && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-red-700 dark:text-red-300">Loss of pay <strong>{data.lopDays} day(s)</strong></span>}
          </div>
        </CardContent>
      </Card>
      <Card className="gap-0">
        <CardHeader className="pb-3"><CardTitle className="text-base">Leave balance (this year)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {balances.map((b) => (
            <div key={b.type}>
              <div className="flex justify-between text-sm"><span>{b.type.charAt(0) + b.type.slice(1).toLowerCase()}</span><span className="font-medium tabular-nums">{b.balance} of {b.entitled} left</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${b.entitled ? (b.balance / b.entitled) * 100 : 0}%` }} /></div>
            </div>
          ))}
          {balances.length === 0 && <p className="text-sm text-muted-foreground">No leave policy.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

const CLAIM_CATEGORIES = ["Travel", "Conveyance", "Teaching material", "Training / workshop", "Food & refreshments", "Mobile & internet", "Medical", "Other"];

function MyClaims() {
  const { data, reload } = useApi<Claim[]>("/expense-claims?mine=1");
  const [draft, setDraft] = useState<null | { date: string; category: string; description: string; amount: number; receiptName: string }>(null);
  const claims = data ?? [];
  const submit = async () => {
    if (!draft) return;
    if (await act(() => api.post<{ claimNo: string }>("/expense-claims",{ ...draft, receiptName: draft.receiptName || null }), (c: { claimNo: string }) => `${c.claimNo} submitted for approval`)) { setDraft(null); void reload(); }
  };
  return (
    <div className="space-y-4">
      <MiniStats items={[
        { label: "Waiting", value: rupees(claims.filter((c) => c.status === "SUBMITTED").reduce((t, c) => t + c.amount, 0)), icon: Clock, tone: "amber" },
        { label: "With next salary", value: rupees(claims.filter((c) => c.status === "APPROVED").reduce((t, c) => t + c.amount, 0)), icon: Wallet, tone: "blue" },
        { label: "Paid", value: rupees(claims.filter((c) => c.status === "PAID").reduce((t, c) => t + c.amount, 0)), icon: CheckCircle2, tone: "green" },
      ]} />
      <div className="flex justify-end"><Button className="gap-2" onClick={() => setDraft({ date: today(), category: CLAIM_CATEGORIES[0], description: "", amount: 0, receiptName: "" })}><Plus className="h-4 w-4" /> New claim</Button></div>
      {claims.length === 0 && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No claims yet. Spent money for school work? Claim it within 90 days.</CardContent></Card>}
      {claims.map((c) => (
        <Card key={c.id} className="gap-0">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{c.category}</p><Badge variant="secondary" className={CLAIM_STATUS[c.status].className}>{CLAIM_STATUS[c.status].label}</Badge></div>
              <p className="text-sm text-muted-foreground">{c.description}</p>
              <p className="text-xs text-muted-foreground">{c.claimNo} · {fmtDate(c.date)}{c.remark ? ` · “${c.remark}”` : ""}</p>
            </div>
            <p className="font-display text-lg font-semibold tabular-nums">{rupees(c.amount)}</p>
          </CardContent>
        </Card>
      ))}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New expense claim</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Date spent</Label><Input type="date" max={today()} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" min={1} value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Category</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CLAIM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>What was it for?</Label><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Auto fare to the CBSE workshop at…" /></div>
              <div className="space-y-1.5"><Label>Receipt</Label><Input type="file" accept="image/*,.pdf" onChange={(e) => setDraft({ ...draft, receiptName: e.target.files?.[0]?.name ?? "" })} /><p className="text-xs text-muted-foreground">Hand the original receipt to the accounts office.</p></div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button disabled={!(draft.amount > 0) || draft.description.trim().length < 3} onClick={submit}>Submit</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MyTrainings() {
  const { data, reload } = useApi<TrainingSummary[]>("/trainings");
  const [open, setOpen] = useState<string | null>(null);
  const list = (data ?? []).filter((t) => t.mine || t.isTrainer);
  return (
    <div className="space-y-3">
      {list.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">You are not enrolled in any training yet.</CardContent></Card>}
      {list.map((t) => (
        <Card key={t.id} className="gap-0">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{t.title}</p><Badge variant="outline">{CATEGORY_LABEL[t.category]}</Badge>
                <Badge variant="secondary" className={TRAINING_STATUS[t.status].className}>{TRAINING_STATUS[t.status].label}</Badge>
                {t.isTrainer && <Badge className="bg-violet-600">You are the trainer</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{fmtDate(t.startDate)}{t.endDate !== t.startDate ? ` – ${fmtDate(t.endDate)}` : ""} · {t.trainerName} · {t.mode === "ONLINE" ? "Online" : t.venue || "Classroom"}</p>
              {t.mine && <p className="text-xs text-muted-foreground">Pre-test {t.mine.preScore ?? "—"}{t.mine.preScore != null ? "%" : ""} · post-test {t.mine.postScore ?? "—"}{t.mine.postScore != null ? "%" : ""}{t.mine.completedAt ? " · completed ✓" : ""}</p>}
            </div>
            <Button size="sm" onClick={() => setOpen(t.id)}>Open</Button>
          </CardContent>
        </Card>
      ))}
      {open && <TrainingRoom id={open} onClose={() => { setOpen(null); void reload(); }} />}
    </div>
  );
}

/** One training for a participant: presentation, pre / post test, feedback. */
function TrainingRoom({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: t, reload } = useApi<TrainingDetail>(`/trainings/${id}`);
  const [test, setTest] = useState<"PRE" | "POST" | null>(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  if (!t) return null;
  const m = t.mine;
  const started = t.startDate <= today();
  const sendFeedback = async () => { if (await act(() => api.post(`/trainings/${id}/feedback`, { rating, feedback: feedback || undefined }), "Thanks for the feedback")) void reload(); };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{t.title}</DialogTitle></DialogHeader>
        {t.description && <p className="-mt-2 text-sm text-muted-foreground">{t.description}</p>}
        {test ? (
          <TestRunner trainingId={id} kind={test} questions={t.questions} onDone={() => { setTest(null); void reload(); }} />
        ) : (
          <div className="space-y-5">
            {m && t.questions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <span className="flex-1">Test: {t.questions.length} questions · pass mark {t.passPercent}%</span>
                {m.preScore == null && m.postScore == null && <Button size="sm" variant="outline" onClick={() => setTest("PRE")}>Take pre-test</Button>}
                {m.preScore != null && <Badge variant="secondary">Pre {m.preScore}%</Badge>}
                {m.postScore == null ? (
                  <Button size="sm" disabled={!started} title={started ? undefined : "Opens when the training starts"} onClick={() => setTest("POST")}>Take post-test</Button>
                ) : <Badge className={m.postScore >= t.passPercent ? "bg-emerald-600" : "bg-red-600"}>Post {m.postScore}%</Badge>}
              </div>
            )}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Presentation className="h-4 w-4" /> Presentation</p>
              <SlideViewer slides={t.slides} />
            </div>
            {m?.attended && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold">How was the training?</p>
                {m.rating ? <p className="text-sm text-muted-foreground">You rated it {m.rating}/5{m.feedback ? ` — “${m.feedback}”` : ""}.</p> : (
                  <>
                    <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(n)}><Star className={cn("h-6 w-6", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} /></button>)}</div>
                    <Textarea rows={2} placeholder="What could be better?" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                    <div className="flex justify-end"><Button size="sm" disabled={!rating} onClick={sendFeedback}>Send</Button></div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MyExit() {
  const { data, reload } = useApi<Separation[]>("/separations?mine=1");
  const [draft, setDraft] = useState<null | { reason: string; letter: string }>(null);
  const current = (data ?? []).find((s) => ["REQUESTED", "ACCEPTED", "CLEARANCE", "SETTLED"].includes(s.status));
  const submit = async () => {
    if (!draft) return;
    if (await act(() => api.post("/separations", { type: "RESIGNATION", reason: draft.reason, letter: draft.letter }), "Resignation submitted to HR")) { setDraft(null); void reload(); }
  };
  const withdraw = async (s: Separation) => { if (await act(() => api.patch(`/separations/${s.id}`, { action: "WITHDRAW" }), "Resignation withdrawn")) void reload(); };
  if (!data) return null;

  if (!current) {
    return (
      <Card className="gap-0">
        <CardContent className="space-y-4 p-6">
          {!draft ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <DoorOpen className="h-8 w-8 text-muted-foreground" />
              <p className="max-w-md text-sm text-muted-foreground">Thinking of leaving? Please talk to the principal or HR first. If you have decided, you can submit your resignation letter here; your notice period starts today.</p>
              <Button variant="outline" onClick={() => setDraft({ reason: "", letter: "" })}>Write a resignation letter</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Reason (short)</Label><Input value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Relocating to Pune" /></div>
              <div className="space-y-1.5"><Label>Resignation letter</Label>
                <Textarea rows={8} value={draft.letter} onChange={(e) => setDraft({ ...draft, letter: e.target.value })}
                  placeholder={"Dear Principal,\n\nI hereby resign from my position as … with effect from today. I will serve the notice period and complete the handover of my classes.\n\nThank you for the opportunity…"} /></div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button disabled={draft.reason.trim().length < 3 || draft.letter.trim().length < 20} onClick={submit}>Submit resignation</Button></div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const s = current;
  const active = s.status === "ACCEPTED" || s.status === "CLEARANCE";
  return (
    <div className="space-y-4">
      <Card className="gap-0">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Badge variant="secondary" className={SEPARATION_STATUS[s.status].className}>{SEPARATION_STATUS[s.status].label}</Badge>
            <p className="mt-2 text-sm">Notice given {fmtDate(s.noticeDate)} · last working day <strong>{fmtDate(s.lastWorkingDay)}</strong></p>
            {s.handover.length > 0 && <p className="text-xs text-muted-foreground">Handover {s.handover.filter((h) => h.done).length} of {s.handover.length} done</p>}
          </div>
          {s.status !== "SETTLED" && <Button variant="outline" size="sm" onClick={() => withdraw(s)}>Withdraw resignation</Button>}
        </CardContent>
      </Card>
      {active && (
        <Card className="gap-0"><CardHeader className="pb-3"><CardTitle className="text-base">Exit interview</CardTitle></CardHeader>
          <CardContent><ExitInterviewForm id={s.id} initial={s.exitInterview} onSaved={() => void reload()} /></CardContent></Card>
      )}
      {s.fnf && (
        <Card className="gap-0"><CardHeader className="pb-3"><CardTitle className="text-base">Full & final settlement</CardTitle></CardHeader>
          <CardContent><FnfStatement f={s.fnf} /></CardContent></Card>
      )}
      <Card className="gap-0"><CardHeader className="pb-3"><CardTitle className="text-base">Letters</CardTitle></CardHeader><CardContent><ExitDocuments id={s.id} /></CardContent></Card>
    </div>
  );
}
