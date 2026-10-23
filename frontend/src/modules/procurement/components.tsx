import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Circle, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import { INDENT_STATUS_LABEL, INDENT_STEPS, inr, purchaseEstimate, type Indent, type IndentStatus } from "@/store/procurement";

const STATUS_TONE: Record<IndentStatus, string> = {
  PENDING_HOD: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PENDING_STORE: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  PENDING_PRINCIPAL: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PENDING_MANAGEMENT: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  APPROVED_FOR_PURCHASE: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  PO_RAISED: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  GOODS_RECEIVED: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  REJECTED: "bg-red-500/10 text-red-700 dark:text-red-300",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function IndentStatusBadge({ status }: { status: IndentStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[status])}>{INDENT_STATUS_LABEL[status]}</span>;
}

/** Raised → HOD → Store → Approval → Purchase → Received → Delivered, with the current step highlighted. */
export function IndentProgress({ indent }: { indent: Indent }) {
  const stopped = indent.status === "REJECTED" || indent.status === "CANCELLED";
  const currentIdx = INDENT_STEPS.findIndex((s) => s.statuses.includes(indent.status));
  // A rejected indent stopped at the rejecting step; a cancelled one at the step after the last action.
  const ROLE_STEP: Record<string, number> = { Teacher: 0, System: 1, HOD: 1, Store: 2, Principal: 3, Management: 3, Purchase: 4 };
  const last = indent.history.at(-1);
  const beforeLast = indent.history.at(-2);
  const stoppedAt = indent.status === "REJECTED"
    ? ROLE_STEP[last?.role ?? ""] ?? 1
    : indent.status === "CANCELLED"
      ? Math.min((ROLE_STEP[beforeLast?.role ?? ""] ?? 0) + 1, 4)
      : -1;
  const doneUpTo = indent.status === "COMPLETED" ? INDENT_STEPS.length : stopped ? stoppedAt : currentIdx;
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Progress">
      {INDENT_STEPS.map((step, i) => {
        const skipped = step.key === "hod" && indent.history.some((h) => h.action === "HOD step skipped");
        const state = stopped && i === stoppedAt ? "stopped" : i < doneUpTo ? "done" : i === doneUpTo ? "current" : "todo";
        return (
          <li key={step.key} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                state === "done" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                state === "current" && "bg-primary text-primary-foreground",
                state === "stopped" && "bg-red-500/10 text-red-700 dark:text-red-300",
                state === "todo" && "bg-muted text-muted-foreground",
                skipped && state === "done" && "opacity-60",
              )}
              title={skipped ? "Skipped" : undefined}
            >
              {state === "done" ? <Check className="h-3 w-3" /> : state === "stopped" ? <X className="h-3 w-3" /> : state === "current" ? <Clock className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
              {step.label}{skipped ? " (skipped)" : ""}
            </span>
            {i < INDENT_STEPS.length - 1 && <span className="h-px w-2 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function IndentTimeline({ indent }: { indent: Indent }) {
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {indent.history.map((h, i) => (
        <li key={i} className="relative">
          <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card", /reject|cancel/i.test(h.action) ? "bg-red-500" : h.role === "System" ? "bg-muted-foreground/40" : "bg-primary")} />
          <p className="text-sm text-foreground"><span className="font-medium">{h.action}</span> <span className="text-muted-foreground">· {h.by} ({h.role}) · {h.at}</span></p>
          {h.remark && <p className="text-xs text-muted-foreground">{h.remark}</p>}
        </li>
      ))}
    </ol>
  );
}

export function IndentLines({ indent, showStore = true }: { indent: Indent; showStore?: boolean }) {
  const checked = indent.lines.some((l) => l.toPurchase !== undefined);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Est. rate</th>
            {showStore && checked && <th className="px-3 py-2 text-right font-medium">From stock</th>}
            {showStore && checked && <th className="px-3 py-2 text-right font-medium">To buy</th>}
            <th className="px-3 py-2 text-right font-medium">Est. value</th>
          </tr>
        </thead>
        <tbody>
          {indent.lines.map((l, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-3 py-2 text-foreground">{l.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{l.qty} {l.unit}</td>
              <td className="px-3 py-2 text-right tabular-nums">{inr(l.estRate)}</td>
              {showStore && checked && <td className="px-3 py-2 text-right tabular-nums">{l.issuedFromStock ?? 0}</td>}
              {showStore && checked && <td className="px-3 py-2 text-right tabular-nums">{l.toPurchase ?? 0}</td>}
              <td className="px-3 py-2 text-right tabular-nums">{inr((checked ? l.toPurchase ?? 0 : l.qty) * l.estRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One indent: summary row, progress, and (expanded) items + history. `actions` sits under the details. */
export function IndentCard({ indent, actions, defaultOpen = false, extra }: { indent: Indent; actions?: ReactNode; defaultOpen?: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const est = purchaseEstimate(indent);
  return (
    <Card className="gap-0">
      <CardContent className="space-y-3 p-4">
        <button type="button" className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-start sm:justify-between" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{indent.no}</span>
              <IndentStatusBadge status={indent.status} />
              {indent.priority === "Urgent" && <Badge variant="destructive" className="h-5">Urgent</Badge>}
            </div>
            <p className="mt-1 font-medium text-foreground">{indent.lines.map((l) => `${l.qty} ${l.unit} ${l.name}`).join(", ")}</p>
            <p className="text-sm text-muted-foreground">{indent.requestedBy.name} · {indent.department} · {indent.location} · needed by {indent.neededBy}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-semibold tabular-nums text-foreground">{inr(est)}</span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
          </div>
        </button>
        <IndentProgress indent={indent} />
        {open && (
          <div className="grid gap-4 border-t border-border pt-3 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-2">
              <p className="text-sm text-foreground"><span className="text-muted-foreground">Purpose:</span> {indent.purpose}</p>
              <IndentLines indent={indent} />
              {extra}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
              <IndentTimeline indent={indent} />
            </div>
          </div>
        )}
        {actions && <div className="border-t border-border pt-3">{actions}</div>}
      </CardContent>
    </Card>
  );
}

/** Runs a flow action (sync or async) and shows its error as text instead of crashing. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => unknown, onDone?: () => void) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      setError(null);
      onDone?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { error, setError, run, busy };
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">{error}</p> : null;
}
