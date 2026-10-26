import { useState } from "react";
import { CalendarPlus, FileSignature, Star } from "lucide-react";
import { api } from "@/api/client";
import { guidOf } from "@/api/ids";
import { CtcTable } from "@/components/hr/hrDocs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import { daysFromToday, today } from "@/lib/dates";
import { act, useApi } from "@/lib/useApi";
import { useCtcPreview } from "./useCtcPreview";
import { applicationStore, updateApplication, type JobApplication } from "@/store/recruitment";

interface Round { id: string; roundNo: number; title: string; mode: string; scheduledAt: string; interviewer: string; rating: number | null; feedback: string | null; result: "PENDING" | "PASS" | "FAIL" | "ON_HOLD" }

const MODES: Record<string, string> = { IN_PERSON: "In person", PHONE: "Phone", VIDEO: "Video call", DEMO_CLASS: "Demo class" };
const RESULT: Record<Round["result"], string> = {
  PENDING: "bg-muted text-muted-foreground", PASS: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  FAIL: "bg-red-500/10 text-red-700 dark:text-red-300", ON_HOLD: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Screening, interview rounds and the offer for one candidate. */
export function CandidatePipeline({ app, jobTitle, onClose, onOffered }: { app: JobApplication; jobTitle: string; onClose: () => void; onOffered: () => void }) {
  const guid = guidOf("job-application", app.id);
  const rounds = useApi<Round[]>(`/interviews?applicationId=${guid}`);
  const [score, setScore] = useState(app.screeningScore ?? 0);
  const [screenNotes, setScreenNotes] = useState(app.screeningNotes);
  const [next, setNext] = useState({ title: "", mode: "IN_PERSON", scheduledAt: `${daysFromToday(2)}T10:00`, interviewer: "" });
  const [results, setResults] = useState<Record<string, { result: string; rating: number; feedback: string }>>({});
  const [offer, setOffer] = useState<null | { designation: string; department: string; staffType: string; employmentType: string; joiningDate: string; validTill: string; ctcAnnual: number }>(null);
  const preview = useCtcPreview(offer?.ctcAnnual ?? 0);

  const list = rounds.data ?? [];
  const last = list[list.length - 1];
  const canSchedule = app.status !== "Rejected" && app.status !== "Selected" && (!last || last.result === "PASS" || last.result === "ON_HOLD");
  const allPassed = list.length > 0 && list.every((r) => r.result === "PASS");

  const saveScreening = () => {
    updateApplication(app.id, { screeningScore: score, screeningNotes: screenNotes, ...(app.status === "Applied" && score >= 50 ? { status: "Shortlisted" as const } : {}) });
  };
  const schedule = async () => {
    if (await act(() => api.post(`/job-applications/${guid}/interviews`, next), `Round ${list.length + 1} scheduled`)) {
      setNext({ ...next, title: "", interviewer: "" });
      void rounds.reload(); void applicationStore.load(true);
    }
  };
  const record = async (r: Round) => {
    const v = results[r.id];
    if (!v) return;
    if (await act(() => api.patch(`/interviews/${r.id}`, v), `Round ${r.roundNo}: ${v.result.toLowerCase().replace("_", " ")}`)) { void rounds.reload(); void applicationStore.load(true); }
  };
  const makeOffer = async () => {
    if (!offer) return;
    if (await act(() => api.post<{ letterNo: string }>(`/job-applications/${guid}/offer`, offer), (o: { letterNo: string }) => `Offer ${o.letterNo} drafted — see Offers`)) { setOffer(null); onOffered(); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{app.name} <span className="font-normal text-muted-foreground">· {jobTitle}</span></DialogTitle></DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">{app.qualification} · {app.experienceYears} yrs · source: {app.source}{app.expectedSalary ? ` · expects ${app.expectedSalary}` : ""}</p>

        <section className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold text-foreground">1. Screening</p>
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-xs">Score</Label>
            <input type="range" min={0} max={100} step={5} value={score} onChange={(e) => setScore(Number(e.target.value))} className="flex-1 accent-primary" aria-label="Screening score" />
            <span className={cn("w-12 text-right text-sm font-semibold tabular-nums", score >= 70 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600")}>{score}</span>
          </div>
          <Textarea rows={2} placeholder="Screening notes — qualification match, communication, salary fit…" value={screenNotes} onChange={(e) => setScreenNotes(e.target.value)} />
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={saveScreening}>Save screening{app.status === "Applied" && score >= 50 ? " & shortlist" : ""}</Button></div>
        </section>

        <section className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold text-foreground">2. Interview rounds</p>
          {list.length === 0 && <p className="text-xs text-muted-foreground">No rounds yet.</p>}
          {list.map((r) => {
            const v = results[r.id] ?? { result: "PASS", rating: 4, feedback: "" };
            return (
              <div key={r.id} className="rounded-md bg-muted/40 p-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Round {r.roundNo}: {r.title}</span>
                  <Badge variant="secondary" className={RESULT[r.result]}>{r.result.replace("_", " ").toLowerCase()}</Badge>
                  <span className="text-xs text-muted-foreground">{MODES[r.mode]} · {when(r.scheduledAt)} · {r.interviewer}</span>
                </div>
                {r.result !== "PENDING" ? (
                  <p className="mt-1 text-xs text-muted-foreground"><Star className="mr-0.5 inline h-3 w-3 fill-amber-400 text-amber-400" />{r.rating}/5 — {r.feedback}</p>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[130px_90px_1fr_auto]">
                    <Select value={v.result} onValueChange={(x) => setResults({ ...results, [r.id]: { ...v, result: x } })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="PASS">Pass</SelectItem><SelectItem value="ON_HOLD">On hold</SelectItem><SelectItem value="FAIL">Fail</SelectItem></SelectContent>
                    </Select>
                    <Select value={String(v.rating)} onValueChange={(x) => setResults({ ...results, [r.id]: { ...v, rating: Number(x) } })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="h-8" placeholder="Feedback" value={v.feedback} onChange={(e) => setResults({ ...results, [r.id]: { ...v, feedback: e.target.value } })} />
                    <Button size="sm" className="h-8" disabled={v.feedback.trim().length < 2} onClick={() => record(r)}>Save</Button>
                  </div>
                )}
              </div>
            );
          })}
          {canSchedule && (
            <div className="grid grid-cols-1 gap-2 border-t border-border pt-2 sm:grid-cols-2">
              <Input className="h-8" placeholder={`Round ${list.length + 1} title (e.g. ${list.length ? "Principal interview" : "Demo class"})`} value={next.title} onChange={(e) => setNext({ ...next, title: e.target.value })} />
              <Select value={next.mode} onValueChange={(v) => setNext({ ...next, mode: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MODES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8" type="datetime-local" value={next.scheduledAt} min={`${today()}T00:00`} onChange={(e) => setNext({ ...next, scheduledAt: e.target.value })} />
              <Input className="h-8" placeholder="Interviewer" value={next.interviewer} onChange={(e) => setNext({ ...next, interviewer: e.target.value })} />
              <div className="flex justify-end sm:col-span-2"><Button size="sm" className="gap-1" disabled={next.title.trim().length < 2 || next.interviewer.trim().length < 2} onClick={schedule}><CalendarPlus className="h-4 w-4" /> Schedule round</Button></div>
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold text-foreground">3. Offer</p>
          {!allPassed && <p className="text-xs text-muted-foreground">The offer can be made once every interview round is passed.</p>}
          {allPassed && !offer && (
            <Button size="sm" className="gap-1" onClick={() => setOffer({ designation: jobTitle === "General application" ? "" : jobTitle, department: "", staffType: "TEACHING", employmentType: "PROBATION", joiningDate: daysFromToday(15), validTill: daysFromToday(7), ctcAnnual: 420000 })}>
              <FileSignature className="h-4 w-4" /> Make an offer
            </Button>
          )}
          {offer && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label className="text-xs">Designation</Label><Input className="h-8" value={offer.designation} onChange={(e) => setOffer({ ...offer, designation: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Department</Label><Input className="h-8" value={offer.department} onChange={(e) => setOffer({ ...offer, department: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Staff type</Label>
                  <Select value={offer.staffType} onValueChange={(v) => setOffer({ ...offer, staffType: v })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="TEACHING">Teaching</SelectItem><SelectItem value="NON_TEACHING">Non-teaching</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">Employment</Label>
                  <Select value={offer.employmentType} onValueChange={(v) => setOffer({ ...offer, employmentType: v })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{["PROBATION", "PERMANENT", "CONTRACT", "PART_TIME", "GUEST"].map((t) => <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase().replace("_", "-")}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">Joining date</Label><Input className="h-8" type="date" min={today()} value={offer.joiningDate} onChange={(e) => setOffer({ ...offer, joiningDate: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Offer valid till</Label><Input className="h-8" type="date" min={today()} value={offer.validTill} onChange={(e) => setOffer({ ...offer, validTill: e.target.value })} /></div>
                <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Annual CTC (₹)</Label><Input className="h-8" type="number" min={10000} step={1000} value={offer.ctcAnnual} onChange={(e) => setOffer({ ...offer, ctcAnnual: Number(e.target.value) })} /></div>
              </div>
              {preview && <CtcTable b={preview} />}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setOffer(null)}>Cancel</Button>
                <Button size="sm" disabled={!preview || offer.designation.trim().length < 2 || !offer.department.trim()} onClick={makeOffer}>Draft offer letter</Button>
              </div>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
