import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, GraduationCap, Pencil, Plus, Presentation, Trash2, Users } from "lucide-react";
import { api } from "@/api/client";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import {
  CATEGORY_LABEL, SlideViewer, TRAINING_STATUS, type Question, type Slide, type TrainingDetail, type TrainingSummary,
} from "@/components/hr/training";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import { daysFromToday, today } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { act, useApi } from "@/lib/useApi";
import { downloadCsv } from "@/store/inventory";

interface StaffLite { id: string; name: string; employeeCode: string; designation: string; department: string | null }
type Draft = {
  id?: string; title: string; category: TrainingSummary["category"]; description: string; trainerName: string; trainerStaffId: string | null; mode: TrainingSummary["mode"];
  venue: string; startDate: string; endDate: string; durationHours: number; passPercent: number; status: TrainingSummary["status"]; slides: Slide[];
};
interface Mis {
  totals: { trainings: number; completed: number; participants: number; attendance: number; trainingHours: number };
  perTraining: { id: string; title: string; category: string; trainer: string; startDate: string; status: string; hours: number; enrolled: number; attended: number; avgPre: number | null; avgPost: number | null; improvement: number | null; passed: number; avgRating: number | null }[];
  perEmployee: { staffId: string; name: string; employeeCode: string; department: string | null; trainings: number; hours: number; avgPost: number | null }[];
}

const blank = (): Draft => ({
  title: "", category: "SKILL", description: "", trainerName: "", trainerStaffId: null, mode: "CLASSROOM", venue: "", startDate: daysFromToday(7), endDate: daysFromToday(7),
  durationHours: 3, passPercent: 60, status: "PLANNED", slides: [{ title: "Welcome", body: "" }],
});
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

/** L&D: the training calendar, modules with presentations and tests, participants, and the MIS report. */
export function Trainings() {
  const { data, reload } = useApi<TrainingSummary[]>("/trainings");
  const staff = useApi<StaffLite[]>("/staff").data ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manage, setManage] = useState<string | null>(null);
  const list = data ?? [];
  const upcoming = list.filter((t) => t.endDate >= today() && t.status !== "CANCELLED").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = list.filter((t) => !upcoming.includes(t));

  const save = async () => {
    if (!draft) return;
    const { id, ...body } = draft;
    const payload = { ...body, description: body.description || null, venue: body.venue || null, slides: body.slides.filter((s) => s.title.trim()) };
    const ok = await act(() => (id ? api.patch(`/trainings/${id}`, payload) : api.post("/trainings", payload)), id ? "Training updated" : "Training added to the calendar");
    if (ok) { setDraft(null); void reload(); }
  };
  const edit = (t: TrainingSummary) => setDraft({
    id: t.id, title: t.title, category: t.category, description: t.description ?? "", trainerName: t.trainerName, trainerStaffId: t.trainerStaffId, mode: t.mode, venue: t.venue ?? "",
    startDate: t.startDate, endDate: t.endDate, durationHours: t.durationHours, passPercent: t.passPercent, status: t.status, slides: t.slides.length ? t.slides : [{ title: "", body: "" }],
  });

  const row = (t: TrainingSummary) => (
    <Card key={t.id} className="gap-0">
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
          <span className="text-[10px] font-semibold uppercase">{new Date(t.startDate).toLocaleDateString("en-IN", { month: "short" })}</span>
          <span className="font-display text-xl font-semibold leading-none">{Number(t.startDate.slice(8))}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{t.title}</p>
            <Badge variant="outline">{CATEGORY_LABEL[t.category]}</Badge>
            <Badge variant="secondary" className={TRAINING_STATUS[t.status].className}>{TRAINING_STATUS[t.status].label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.trainerName} · {t.mode === "ONLINE" ? "Online" : t.venue || "Classroom"} · {t.durationHours} h · {t.startDate === t.endDate ? fmtDate(t.startDate) : `${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t.enrolled} participants · {t.slides.length} slides · {t.questions ? `${t.questions}-question test (pass ${t.passPercent}%)` : "no test yet"}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => edit(t)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button size="sm" className="gap-1" onClick={() => setManage(t.id)}><Users className="h-3.5 w-3.5" /> Manage</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Training & Development" description="Induction and skill trainings — calendar, presentation, pre / post tests, trainer and participants."
        actions={<Button className="gap-2" onClick={() => setDraft(blank())}><Plus className="h-4 w-4" /> New training</Button>} />
      <Tabs defaultValue="calendar">
        <TabsList><TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="h-4 w-4" /> Calendar</TabsTrigger><TabsTrigger value="mis" className="gap-1.5"><BarChart3 className="h-4 w-4" /> MIS report</TabsTrigger></TabsList>
        <TabsContent value="calendar" className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Upcoming & ongoing</p>
          {upcoming.length === 0 && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled. Add a training to the calendar.</CardContent></Card>}
          {upcoming.map(row)}
          {past.length > 0 && <p className="pt-3 text-sm font-medium text-muted-foreground">Past</p>}
          {past.map(row)}
        </TabsContent>
        <TabsContent value="mis"><TrainingMis /></TabsContent>
      </Tabs>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit training" : "New training"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2"><Label>Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Classroom management for new teachers" /></div>
                <div className="space-y-1.5"><Label>Type</Label>
                  <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v as Draft["category"] })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(CATEGORY_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Mode</Label>
                  <Select value={draft.mode} onValueChange={(v) => setDraft({ ...draft, mode: v as Draft["mode"] })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="CLASSROOM">Classroom</SelectItem><SelectItem value="ONLINE">Online (presentation)</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Trainer (staff)</Label>
                  <Select value={draft.trainerStaffId ?? "external"} onValueChange={(v) => { const s = staff.find((x) => x.id === v); setDraft({ ...draft, trainerStaffId: s?.id ?? null, trainerName: s?.name ?? draft.trainerName }); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="external">External trainer</SelectItem>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.designation}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="space-y-1.5"><Label>Trainer name</Label><Input value={draft.trainerName} disabled={!!draft.trainerStaffId} onChange={(e) => setDraft({ ...draft, trainerName: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Starts</Label><Input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value, endDate: draft.endDate < e.target.value ? e.target.value : draft.endDate })} /></div>
                <div className="space-y-1.5"><Label>Ends</Label><Input type="date" min={draft.startDate} value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Duration (hours)</Label><Input type="number" min={0.5} step={0.5} value={draft.durationHours} onChange={(e) => setDraft({ ...draft, durationHours: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Pass mark (%)</Label><Input type="number" min={0} max={100} value={draft.passPercent} onChange={(e) => setDraft({ ...draft, passPercent: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>{draft.mode === "ONLINE" ? "Meeting link" : "Venue"}</Label><Input value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Status</Label>
                  <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Draft["status"] })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TRAINING_STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>About the training</Label><Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="flex items-center gap-1.5"><Presentation className="h-4 w-4" /> Presentation slides</Label>
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => setDraft({ ...draft, slides: [...draft.slides, { title: "", body: "" }] })}><Plus className="h-3.5 w-3.5" /> Slide</Button></div>
                {draft.slides.map((s, i) => (
                  <div key={i} className="space-y-1.5 rounded-lg border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-muted-foreground">{i + 1}.</span>
                      <Input className="h-8" placeholder="Slide title" value={s.title} onChange={(e) => setDraft({ ...draft, slides: draft.slides.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Remove slide" onClick={() => setDraft({ ...draft, slides: draft.slides.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <Textarea rows={3} placeholder={"Points — start a line with “-” for a bullet"} value={s.body} onChange={(e) => setDraft({ ...draft, slides: draft.slides.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)) })} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                <Button onClick={save} disabled={draft.title.trim().length < 3 || draft.trainerName.trim().length < 2 || !(draft.durationHours > 0)}>Save</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {manage && <ManageTraining id={manage} staff={staff} onClose={() => { setManage(null); void reload(); }} />}
    </div>
  );
}

/** Participants (enrol, attendance, scores), the question bank and the presentation of one training. */
function ManageTraining({ id, staff, onClose }: { id: string; staff: StaffLite[]; onClose: () => void }) {
  const { data: t, reload } = useApi<TrainingDetail>(`/trainings/${id}`);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  useEffect(() => { if (t) setQuestions(t.questions); }, [t]);
  if (!t) return null;

  const enrolled = new Set(t.participants.map((p) => p.staffId));
  const q = search.toLowerCase();
  const candidates = staff.filter((s) => !enrolled.has(s.id) && s.id !== t.trainerStaffId && (!q || `${s.name} ${s.designation} ${s.department ?? ""}`.toLowerCase().includes(q)));
  const locked = t.participants.some((p) => p.preScore != null || p.postScore != null);
  const started = t.startDate <= today();

  const enroll = async () => {
    if (await act(() => api.post<{ added: number }>(`/trainings/${id}/enroll`, { staffIds: [...pick] }), (r) => `${r.added} enrolled`)) { setPick(new Set()); void reload(); }
  };
  const remove = async (staffId: string) => { if (await act(() => api.del(`/trainings/${id}/enroll/${staffId}`).then(() => true))) void reload(); };
  const attendance = async (staffId: string, attended: boolean) => { if (await act(() => api.post(`/trainings/${id}/attendance`, { entries: [{ staffId, attended }] }))) void reload(); };
  const saveQuestions = async () => {
    const body = { questions: questions.filter((x) => x.question.trim()).map((x) => ({ question: x.question, options: x.options.filter((o) => o.trim()), answerIndex: x.answerIndex ?? 0 })) };
    if (await act(() => api.put(`/trainings/${id}/questions`, body), `${body.questions.length} questions saved`)) void reload();
  };
  const setQ = (i: number, patch: Partial<Question>) => setQuestions(questions.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{t.title}</DialogTitle></DialogHeader>
        <Tabs defaultValue="people">
          <TabsList><TabsTrigger value="people">Participants ({t.participants.length})</TabsTrigger><TabsTrigger value="test">Test ({t.questions.length})</TabsTrigger><TabsTrigger value="slides">Presentation</TabsTrigger></TabsList>

          <TabsContent value="people" className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-2 text-left font-medium">Participant</th><th className="px-2 py-2 font-medium">Attended</th><th className="px-2 py-2 text-right font-medium">Pre</th><th className="px-2 py-2 text-right font-medium">Post</th><th className="px-2 py-2 text-right font-medium">Rating</th><th /></tr></thead>
                <tbody className="divide-y divide-border/60">
                  {t.participants.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nobody enrolled yet.</td></tr>}
                  {t.participants.map((p) => (
                    <tr key={p.staffId}>
                      <td className="px-3 py-2"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.employeeCode} · {p.designation}</p></td>
                      <td className="px-2 py-2 text-center"><Checkbox checked={p.attended} disabled={!started} onCheckedChange={(v) => attendance(p.staffId, v === true)} aria-label={`${p.name} attended`} /></td>
                      <td className="px-2 py-2 text-right tabular-nums">{pct(p.preScore)}</td>
                      <td className={cn("px-2 py-2 text-right font-medium tabular-nums", p.postScore != null && (p.postScore >= t.passPercent ? "text-emerald-600" : "text-red-600"))}>{pct(p.postScore)}</td>
                      <td className="px-2 py-2 text-right" title={p.feedback ?? undefined}>{p.rating ? `${p.rating}★` : "—"}</td>
                      <td className="px-2 py-2 text-right">{p.preScore == null && p.postScore == null && !p.attended && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove" onClick={() => remove(p.staffId)}><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!started && <p className="text-xs text-muted-foreground">Attendance can be marked from {fmtDate(t.startDate)}.</p>}
            {t.status !== "COMPLETED" && t.status !== "CANCELLED" && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm font-medium">Enrol participants</p>
                  <Input className="h-8 w-48" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setPick(new Set(candidates.map((c) => c.id)))}>All</Button>
                </div>
                <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {candidates.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                      <Checkbox checked={pick.has(s.id)} onCheckedChange={(v) => { const n = new Set(pick); if (v) n.add(s.id); else n.delete(s.id); setPick(n); }} />
                      <span className="truncate">{s.name} <span className="text-xs text-muted-foreground">· {s.designation}</span></span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end"><Button size="sm" disabled={!pick.size} onClick={enroll}>Enrol {pick.size || ""}</Button></div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="test" className="space-y-3">
            {locked && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">Someone has taken a test — the questions are locked.</p>}
            <p className="text-xs text-muted-foreground">The same questions are used for the pre-test (before) and post-test (after) so the improvement can be measured.</p>
            {questions.map((x, i) => (
              <div key={x.id || i} className="space-y-1.5 rounded-lg border border-border p-2.5">
                <div className="flex gap-2">
                  <span className="pt-2 text-xs text-muted-foreground">{i + 1}.</span>
                  <Input className="h-8" disabled={locked} placeholder="Question" value={x.question} onChange={(e) => setQ(i, { question: e.target.value })} />
                  {!locked && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Remove question" onClick={() => setQuestions(questions.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>}
                </div>
                <div className="grid grid-cols-1 gap-1.5 pl-5 sm:grid-cols-2">
                  {x.options.map((o, oi) => (
                    <label key={oi} className="flex items-center gap-2">
                      <input type="radio" name={`ans-${i}`} disabled={locked} checked={(x.answerIndex ?? 0) === oi} onChange={() => setQ(i, { answerIndex: oi })} aria-label={`Option ${oi + 1} is correct`} />
                      <Input className="h-8" disabled={locked} placeholder={`Option ${String.fromCharCode(65 + oi)}`} value={o} onChange={(e) => setQ(i, { options: x.options.map((y, k) => (k === oi ? e.target.value : y)) })} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!locked && (
              <div className="flex justify-between">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setQuestions([...questions, { id: "", question: "", options: ["", "", "", ""], answerIndex: 0 }])}><Plus className="h-4 w-4" /> Question</Button>
                <Button size="sm" onClick={saveQuestions}>Save questions</Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Select the radio button next to the correct answer.</p>
          </TabsContent>

          <TabsContent value="slides"><SlideViewer slides={t.slides} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** The L&D MIS report — per training and per employee. */
function TrainingMis() {
  const [from, setFrom] = useState(`${today().slice(0, 4)}-04-01` <= today() ? `${today().slice(0, 4)}-04-01` : `${Number(today().slice(0, 4)) - 1}-04-01`);
  const { data } = useApi<Mis>(`/trainings-mis?from=${from}`);
  if (!data) return null;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label>From</Label><Input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => downloadCsv(`training-mis-${from}.csv`, ["Training", "Type", "Trainer", "Date", "Hours", "Enrolled", "Attended", "Avg pre %", "Avg post %", "Improvement", "Passed", "Rating"],
          data.perTraining.map((r) => [r.title, r.category, r.trainer, r.startDate, r.hours, r.enrolled, r.attended, r.avgPre ?? "", r.avgPost ?? "", r.improvement ?? "", r.passed, r.avgRating ?? ""]))}>CSV</Button>
      </div>
      <MiniStats items={[
        { label: "Trainings", value: `${t.completed}/${t.trainings}`, icon: GraduationCap, tone: "blue" },
        { label: "People trained", value: t.participants, icon: Users, tone: "violet" },
        { label: "Attendance", value: `${t.attendance}%`, icon: CalendarDays, tone: "green" },
        { label: "Training hours", value: t.trainingHours, icon: BarChart3, tone: "amber" },
      ]} />
      <Card className="gap-0">
        <CardHeader className="pb-3"><CardTitle className="text-base">By training</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs text-muted-foreground">{["Training", "Date", "Enrolled", "Attended", "Pre", "Post", "Gain", "Passed", "Rating"].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border/60">
              {data.perTraining.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2"><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.trainer}</p></td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.startDate)}</td>
                  <td className="px-3 py-2 text-right">{r.enrolled}</td><td className="px-3 py-2 text-right">{r.attended}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.avgPre)}</td><td className="px-3 py-2 text-right tabular-nums">{pct(r.avgPost)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", (r.improvement ?? 0) > 0 && "text-emerald-600")}>{r.improvement == null ? "—" : `${r.improvement > 0 ? "+" : ""}${r.improvement}`}</td>
                  <td className="px-3 py-2 text-right">{r.passed}</td><td className="px-3 py-2 text-right">{r.avgRating ? `${r.avgRating}★` : "—"}</td>
                </tr>
              ))}
              {data.perTraining.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No trainings in this period.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="gap-0">
        <CardHeader className="pb-3"><CardTitle className="text-base">By employee</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs text-muted-foreground">{["Employee", "Department", "Trainings attended", "Hours", "Avg post-test"].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border/60">
              {data.perEmployee.map((r) => (
                <tr key={r.staffId}><td className="px-3 py-2 font-medium">{r.name} <span className="text-xs font-normal text-muted-foreground">{r.employeeCode}</span></td><td className="px-3 py-2 text-muted-foreground">{r.department ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.trainings}</td><td className="px-3 py-2 text-right">{r.hours}</td><td className="px-3 py-2 text-right tabular-nums">{pct(r.avgPost)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
