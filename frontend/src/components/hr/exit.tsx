import { useState } from "react";
import { FileText } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import { printDocument } from "@/lib/print";
import { act } from "@/lib/useApi";
import { acceptanceLetterHtml, experienceCertificateHtml, relievingLetterHtml, resignationLetterHtml, type ExitDocs } from "./hrDocs";

export interface FnfLine { label: string; amount: number }
export interface Fnf { computedAt: string; lastWorkingDay: string; salaryPaidByPayroll: boolean; serviceYears: number; earnings: FnfLine[]; deductions: FnfLine[]; totalEarnings: number; totalDeductions: number; net: number; remarks: string | null }
export interface ExitInterview { primaryReason: string; workEnvironment: number; management: number; growth: number; compensation: number; wouldRecommend: boolean; wouldRejoin: boolean; suggestions?: string; recordedAt?: string }
export interface Separation {
  id: string; staffId: string; staff: { name: string; employeeCode: string; designation: string; department: string | null } | null;
  type: "RESIGNATION" | "TERMINATION" | "RETIREMENT" | "CONTRACT_END"; noticeDate: string; lastWorkingDay: string; reason: string; letter: string | null;
  status: "REQUESTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CLEARANCE" | "SETTLED"; exitInterview: ExitInterview | null;
  handover: { item: string; owner: string; done: boolean }[]; fnf: Fnf | null; sentToAccounts: boolean; settledAt: string | null; createdAt: string;
}

export const SEPARATION_TYPE: Record<Separation["type"], string> = { RESIGNATION: "Resignation", TERMINATION: "Termination", RETIREMENT: "Retirement", CONTRACT_END: "End of contract" };
export const SEPARATION_STATUS: Record<Separation["status"], { label: string; className: string }> = {
  REQUESTED: { label: "Waiting for acceptance", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  ACCEPTED: { label: "Serving notice", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  CLEARANCE: { label: "Clearance / F&F", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  SETTLED: { label: "Settled — left", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  REJECTED: { label: "Not accepted", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-muted text-muted-foreground" },
};
export const EXIT_REASONS = ["Better opportunity", "Higher studies", "Relocation", "Personal / family", "Compensation", "Work environment", "Health", "Retirement", "Other"];

/** Buttons that print the exit letters available at this stage. */
export function ExitDocuments({ id }: { id: string }) {
  const [docs, setDocs] = useState<ExitDocs | null>(null);
  const load = async () => { const d = await act(() => api.get<ExitDocs>(`/separations/${id}/documents`)); if (d) setDocs(d); return d; };
  const open = async (which: "resignation" | "acceptance" | "experience" | "relieving") => {
    const d = docs ?? (await load());
    if (!d) return;
    const [title, html] = which === "resignation" ? ["Resignation letter", resignationLetterHtml(d)] : which === "acceptance" ? ["Acceptance of resignation", acceptanceLetterHtml(d)]
      : which === "experience" ? ["Experience certificate", experienceCertificateHtml(d)] : ["Relieving letter", relievingLetterHtml(d)];
    printDocument(`${title} — ${d.employee.name}`, html);
  };
  const a = docs?.available;
  return (
    <div className="flex flex-wrap gap-2">
      {!docs && <Button size="sm" variant="outline" className="gap-1" onClick={load}><FileText className="h-4 w-4" /> Letters</Button>}
      {a?.resignationLetter && <Button size="sm" variant="outline" onClick={() => open("resignation")}>Resignation letter</Button>}
      {a?.acceptanceLetter && <Button size="sm" variant="outline" onClick={() => open("acceptance")}>Acceptance letter</Button>}
      {a?.experienceCertificate && <Button size="sm" variant="outline" onClick={() => open("experience")}>Experience certificate</Button>}
      {a?.relievingLetter && <Button size="sm" variant="outline" onClick={() => open("relieving")}>Relieving letter</Button>}
      {docs && !a?.experienceCertificate && <span className="self-center text-xs text-muted-foreground">Experience & relieving letters are issued after settlement.</span>}
    </div>
  );
}

const RATINGS = [["workEnvironment", "Work environment"], ["management", "Management & support"], ["growth", "Growth & learning"], ["compensation", "Salary & benefits"]] as const;

/** Exit interview questionnaire. */
export function ExitInterviewForm({ id, initial, onSaved }: { id: string; initial: ExitInterview | null; onSaved: () => void }) {
  const [v, setV] = useState<ExitInterview>(initial ?? { primaryReason: EXIT_REASONS[0], workEnvironment: 4, management: 4, growth: 4, compensation: 3, wouldRecommend: true, wouldRejoin: true, suggestions: "" });
  const save = async () => { if (await act(() => api.put(`/separations/${id}/exit-interview`, v), "Exit interview saved")) onSaved(); };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Main reason for leaving</Label>
        <div className="flex flex-wrap gap-1.5">
          {EXIT_REASONS.map((r) => <button key={r} type="button" onClick={() => setV({ ...v, primaryReason: r })} className={cn("rounded-full border px-3 py-1 text-xs", v.primaryReason === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>{r}</button>)}
        </div>
      </div>
      {RATINGS.map(([k, label]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <span className="text-sm">{label}</span>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${label} ${n}`} onClick={() => setV({ ...v, [k]: n })} className={cn("h-8 w-8 rounded-md border text-sm", v[k] >= n ? "border-amber-400 bg-amber-400/20 text-amber-700 dark:text-amber-300" : "border-border text-muted-foreground")}>{n}</button>)}</div>
        </div>
      ))}
      <label className="flex items-center justify-between text-sm">Would recommend the school as a workplace <Switch checked={v.wouldRecommend} onCheckedChange={(x) => setV({ ...v, wouldRecommend: x })} /></label>
      <label className="flex items-center justify-between text-sm">Would consider rejoining <Switch checked={v.wouldRejoin} onCheckedChange={(x) => setV({ ...v, wouldRejoin: x })} /></label>
      <Textarea rows={3} placeholder="Suggestions for the school" value={v.suggestions ?? ""} onChange={(e) => setV({ ...v, suggestions: e.target.value })} />
      <div className="flex justify-end"><Button size="sm" onClick={save}>Save exit interview</Button></div>
    </div>
  );
}

/** The F&F statement. */
export function FnfStatement({ f }: { f: Fnf }) {
  const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payable</p>
          {f.earnings.map((e) => <div key={e.label} className="flex justify-between gap-2 py-0.5"><span className="text-foreground/90">{e.label}</span><span className="tabular-nums">{rupee(e.amount)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{rupee(f.totalEarnings)}</span></div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recoveries</p>
          {f.deductions.map((e) => <div key={e.label} className="flex justify-between gap-2 py-0.5"><span className="text-foreground/90">{e.label}</span><span className="tabular-nums">−{rupee(e.amount)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{rupee(f.totalDeductions)}</span></div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3"><span className="font-medium">Net {f.net >= 0 ? "payable" : "recoverable"}</span><span className="font-display text-xl font-semibold tabular-nums">{rupee(Math.abs(f.net))}</span></div>
      <p className="text-xs text-muted-foreground">{f.serviceYears} years of service · {f.salaryPaidByPayroll ? "last month's salary already paid in payroll" : "last month's salary included"}{f.remarks ? ` · ${f.remarks}` : ""}</p>
    </div>
  );
}
