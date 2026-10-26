import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rupees } from "@/lib/format";
import { printDocument } from "@/lib/print";
import { useApi } from "@/lib/useApi";
import { monthLabel, payslipHtml, payslipLines, type PayslipDetail } from "./hrDocs";

/** One payslip on screen, with Print / Save as PDF. */
export function PayslipDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: p, error } = useApi<PayslipDetail>(`/payslips/${id}`);
  const lines = p ? payslipLines(p) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{p ? `Payslip — ${monthLabel(p.month)}` : "Payslip"}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {p && lines && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3 text-xs">
              <span className="text-muted-foreground">Employee</span><span className="font-medium">{p.staff.name} ({p.staff.employeeCode})</span>
              <span className="text-muted-foreground">Designation</span><span>{p.staff.designation}</span>
              <span className="text-muted-foreground">Paid days</span><span>{p.breakdown.paidDays ?? "—"} of {p.breakdown.daysInMonth ?? "—"}{p.breakdown.lopDays ? ` (${p.breakdown.lopDays} LOP)` : ""}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings</p>
                {lines.earnings.map(([l, v]) => <div key={l} className="flex justify-between py-0.5"><span>{l}</span><span className="tabular-nums">{rupees(v)}</span></div>)}
                <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Gross</span><span className="tabular-nums">{rupees(p.gross)}</span></div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions</p>
                {lines.deductions.map(([l, v]) => <div key={l} className="flex justify-between py-0.5"><span>{l}</span><span className="tabular-nums text-red-600 dark:text-red-400">−{rupees(v)}</span></div>)}
                <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{rupees(p.deductions)}</span></div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3">
              <span className="font-medium">Net pay</span><span className="font-display text-xl font-semibold tabular-nums">{rupees(p.net)}</span>
            </div>
            <div className="flex justify-end"><Button className="gap-2" onClick={() => printDocument(`Payslip ${p.staff.employeeCode} ${p.month}`, payslipHtml(p))}><Printer className="h-4 w-4" /> Print / PDF</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
