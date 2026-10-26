import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, XCircle } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { act } from "@/lib/useApi";

export interface Slide { title: string; body: string }
export interface Question { id: string; question: string; options: string[]; answerIndex?: number }
export interface MyScore { preScore: number | null; postScore: number | null; attended: boolean; completedAt?: string | null; rating: number | null; feedback: string | null }
export interface TrainingSummary {
  id: string; branchId: string; title: string; category: "INDUCTION" | "SKILL" | "COMPLIANCE" | "SAFETY" | "OTHER"; description: string | null; trainerName: string; trainerStaffId: string | null;
  mode: "CLASSROOM" | "ONLINE"; venue: string | null; startDate: string; endDate: string; durationHours: number; slides: Slide[]; passPercent: number;
  status: "PLANNED" | "ONGOING" | "COMPLETED" | "CANCELLED"; enrolled: number; questions: number; isTrainer: boolean; mine: MyScore | null;
}
export interface Participant { staffId: string; name: string; employeeCode: string; designation: string; preScore: number | null; postScore: number | null; attended: boolean; completedAt: string | null; rating: number | null; feedback: string | null }
export interface TrainingDetail extends Omit<TrainingSummary, "enrolled" | "questions" | "isTrainer"> { canManage: boolean; questions: Question[]; participants: Participant[] }

export const CATEGORY_LABEL: Record<TrainingSummary["category"], string> = { INDUCTION: "Induction", SKILL: "Skill", COMPLIANCE: "Compliance", SAFETY: "Safety", OTHER: "Other" };
export const TRAINING_STATUS: Record<TrainingSummary["status"], { label: string; className: string }> = {
  PLANNED: { label: "Planned", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  ONGOING: { label: "Ongoing", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  COMPLETED: { label: "Completed", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

/** The online presentation: one slide at a time with keyboard-free prev / next. */
export function SlideViewer({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  if (!slides.length) return <p className="py-8 text-center text-sm text-muted-foreground">No presentation for this training.</p>;
  const s = slides[Math.min(i, slides.length - 1)];
  return (
    <div className="space-y-3">
      <div className="flex min-h-[260px] flex-col justify-center rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-10">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Slide {i + 1} of {slides.length}</p>
        <h3 className="mt-2 font-display text-2xl font-semibold text-foreground">{s.title}</h3>
        <div className="mt-4 space-y-1.5 text-sm leading-relaxed text-foreground/90">
          {s.body.split("\n").filter(Boolean).map((line, k) => (line.trim().startsWith("-") || line.trim().startsWith("•")
            ? <p key={k} className="flex gap-2"><span className="text-primary">•</span><span>{line.trim().replace(/^[-•]\s*/, "")}</span></p>
            : <p key={k}>{line}</p>))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="gap-1" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
        <div className="flex gap-1">{slides.map((_, k) => <button key={k} type="button" aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={cn("h-2 w-2 rounded-full", k === i ? "bg-primary" : "bg-muted-foreground/30")} />)}</div>
        <Button variant="outline" size="sm" className="gap-1" disabled={i >= slides.length - 1} onClick={() => setI(i + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

interface TestResult { kind: "PRE" | "POST"; score: number; correct: number; total: number; passed: boolean; passPercent: number; answers?: number[] }

/** A pre- or post-test: the server scores it (and shows the right answers after the post-test). */
export function TestRunner({ trainingId, kind, questions, onDone }: { trainingId: string; kind: "PRE" | "POST"; questions: Question[]; onDone: () => void }) {
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [result, setResult] = useState<TestResult | null>(null);
  const unanswered = answers.filter((a) => a < 0).length;
  const submit = async () => {
    const r = await act(() => api.post<TestResult>(`/trainings/${trainingId}/test`, { kind, answers }));
    if (r) setResult(r);
  };

  return (
    <div className="space-y-4">
      {result && (
        <div className={cn("flex items-center gap-3 rounded-lg p-4", result.kind === "PRE" || result.passed ? "bg-emerald-500/10" : "bg-red-500/10")}>
          {result.kind === "PRE" || result.passed ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <XCircle className="h-6 w-6 text-red-600" />}
          <div className="flex-1">
            <p className="font-semibold text-foreground">{result.score}% — {result.correct} of {result.total} correct</p>
            <p className="text-sm text-muted-foreground">{result.kind === "PRE" ? "Pre-test recorded. Take the post-test after the training to see how much you learnt." : result.passed ? "Passed — training completed." : `Pass mark is ${result.passPercent}%. Talk to HR about a re-attempt.`}</p>
          </div>
          <Button size="sm" onClick={onDone}>Done</Button>
        </div>
      )}
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">{qi + 1}. {q.question}</p>
          <div className="mt-2 grid gap-1.5">
            {q.options.map((o, oi) => {
              const right = result?.answers?.[qi] === oi;
              const wrongPick = result?.answers && answers[qi] === oi && !right;
              return (
                <button key={oi} type="button" disabled={!!result} onClick={() => setAnswers((prev) => prev.map((a, k) => (k === qi ? oi : a)))}
                  className={cn("rounded-md border px-3 py-2 text-left text-sm transition-colors", answers[qi] === oi ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                    right && "border-emerald-500 bg-emerald-500/10", wrongPick && "border-red-500 bg-red-500/10")}>
                  {String.fromCharCode(65 + oi)}. {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!result && (
        <div className="flex items-center justify-end gap-3">
          {unanswered > 0 && <span className="text-xs text-muted-foreground">{unanswered} not answered (counted wrong)</span>}
          <Button onClick={submit}>Submit {kind === "PRE" ? "pre-test" : "post-test"}</Button>
        </div>
      )}
    </div>
  );
}
