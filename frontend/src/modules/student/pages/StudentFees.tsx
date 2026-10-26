import { useState } from "react";
import { useNavigate } from "react-router";
import { CheckCircle2, CreditCard, Download, Loader2, PartyPopper, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/utils";
import { daysUntil } from "@/lib/dates";
import { fmtDate, fmtDay, relativeDay, rupees } from "@/lib/format";
import { useSectionBase } from "@/lib/section";
import { currentAcademicYear } from "@/store/classes";
import { feeAccount, payInstallment, useFeePayments } from "@/store/fees";
import { useCurrentStudent } from "@/store/session";
import type { Installment } from "@/types/fees";

/** Saves a small text file (statement / receipt). */
function saveText(fileName: string, lines: string[]) {
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function StudentFees() {
  const base = useSectionBase();
  const navigate = useNavigate();
  const student = useCurrentStudent();
  const payments = useFeePayments();
  const [payingNo, setPayingNo] = useState<number | null>(null);
  if (!student) return null;

  const account = feeAccount(student, payments);
  const next = account.nextDue;
  const year = student.academicYear || currentAcademicYear;
  const paidPct = account.total ? Math.round((account.paid / account.total) * 100) : 100;

  const pay = (inst: Installment) => {
    if (payingNo !== null) return;
    setPayingNo(inst.no);
    // gateway step, then the payment is recorded (the server confirms amount, late fee and receipt number)
    setTimeout(async () => {
      const payment = await payInstallment(student, inst.no, "UPI").catch(() => undefined);
      setPayingNo(null);
      if (!payment) return;
      navigate(`${base}/fees/success`, {
        state: { txnId: payment.txnId, orderId: `ORD${payment.id}`, amount: payment.amount, lateFee: payment.lateFee, installmentName: inst.name, method: payment.method },
      });
    }, 1200);
  };

  const downloadReceipt = (inst: Installment) => {
    const p = inst.payment;
    if (!p) return;
    saveText(`receipt-${p.txnId.replace(/[^\w-]+/g, "_")}.txt`, [
      "FEE RECEIPT",
      `Receipt / transaction: ${p.txnId}`,
      `Student: ${student.name} (${student.class}, Roll ${student.rollNo}, Adm. ${student.admissionNo})`,
      `Academic year: ${year}`,
      `${inst.name}: ${rupees(p.amount)}${p.lateFee ? ` + late fee ${rupees(p.lateFee)}` : ""}`,
      `Total paid: ${rupees(p.amount + p.lateFee)}`,
      `Paid on ${fmtDate(p.date)} by ${p.method}`,
    ]);
    toast.success("Receipt downloaded");
  };

  const downloadStatement = () => {
    saveText(`fee-statement-${student.admissionNo}.txt`, [
      `Fee Statement — Academic Year ${year}`,
      `Student: ${student.name} (${student.class}, Roll ${student.rollNo})`,
      `Total ${rupees(account.total)} · Paid ${rupees(account.paid)} · Pending ${rupees(account.pending)}`,
      "",
      ...account.installments.map((i) =>
        `${i.name}: ${rupees(i.amount)} · due ${fmtDate(i.dueDate)} · ${i.payment ? `paid ${fmtDate(i.payment.date)} by ${i.payment.method} (${i.payment.txnId})${i.payment.lateFee ? ` + late fee ${rupees(i.payment.lateFee)}` : ""}` : i.status.toUpperCase()}`),
    ]);
    toast.success("Statement downloaded");
  };

  const statusText = (i: Installment) =>
    i.status === "paid" ? `Paid on ${fmtDay(i.payment!.date)}` : i.status === "overdue" ? `Overdue · was due ${fmtDay(i.dueDate)}` : `Due ${relativeDay(i.dueDate)} · ${fmtDay(i.dueDate)}`;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">Fees</h1>
          <p className="mt-1 text-sm text-muted-foreground">Academic year {year}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={downloadStatement}>
          <Download className="h-4 w-4" /> <span className="hidden sm:inline">Statement</span>
        </Button>
      </div>

      {/* Next payment */}
      {next ? (
        <Card className={cn("gap-0 border-2", next.status === "overdue" ? "border-red-300 dark:border-red-500/40" : "border-primary/30")}>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={cn("text-sm font-medium", next.status === "overdue" ? "text-red-600 dark:text-red-400" : "text-primary")}>
                {next.status === "overdue" ? "Payment overdue" : "Next payment"}
              </p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">{rupees(next.amount + next.lateFee)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {next.name} · {next.status === "overdue" ? `was due ${fmtDate(next.dueDate)}` : `due ${relativeDay(next.dueDate)} (${fmtDate(next.dueDate)})`}
              </p>
              {next.lateFee > 0 && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Includes a late fee of {rupees(next.lateFee)} — it grows every day after the due date.</p>}
              {next.status !== "overdue" && daysUntil(next.dueDate) <= 7 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Pay before the due date to avoid a late fee.</p>}
            </div>
            <Button size="lg" className="w-full gap-2 sm:w-auto" onClick={() => pay(next)} disabled={payingNo !== null}>
              {payingNo === next.no ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
              {payingNo === next.no ? "Processing…" : "Pay now"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 border-emerald-300 dark:border-emerald-500/40">
          <CardContent className="flex items-center gap-4 p-5">
            <PartyPopper className="h-8 w-8 shrink-0 text-emerald-500" />
            <div>
              <p className="font-semibold text-foreground">All fees paid for {year}</p>
              <p className="text-sm text-muted-foreground">Thank you! Receipts are below.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card className="gap-0">
        <CardContent className="p-5">
          <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
            <div>
              <p className="text-xs text-muted-foreground sm:text-sm">Total for the year</p>
              <p className="mt-1 text-base font-semibold text-foreground sm:text-xl">{rupees(account.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground sm:text-sm">Paid</p>
              <p className="mt-1 text-base font-semibold text-emerald-600 dark:text-emerald-400 sm:text-xl">{rupees(account.paid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground sm:text-sm">Pending</p>
              <p className={cn("mt-1 text-base font-semibold sm:text-xl", account.pending ? "text-orange-600 dark:text-orange-400" : "text-foreground")}>{rupees(account.pending)}</p>
            </div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{paidPct}% of this year's fees paid{student.concessionPercent && Number(student.concessionPercent) > 0 ? ` · ${student.concessionPercent}% concession applied` : ""}</p>
        </CardContent>
      </Card>

      {/* Installments */}
      <Card className="gap-0">
        <CardHeader className="pb-3"><CardTitle className="text-base">Installments</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border">
          {account.installments.map((i) => (
            <div key={i.no} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                i.status === "paid" ? "bg-emerald-500/10 text-emerald-600" : i.status === "overdue" ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground")}>
                {i.status === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-sm font-semibold">{i.no}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{i.name} · {rupees(i.amount)}</p>
                <p className={cn("text-xs", i.status === "overdue" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{statusText(i)}</p>
              </div>
              {i.status === "paid" ? (
                <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={() => downloadReceipt(i)}><Receipt className="h-4 w-4" /> Receipt</Button>
              ) : (
                <Button variant={i === next ? "default" : "outline"} size="sm" className="shrink-0" disabled={payingNo !== null} onClick={() => pay(i)}>
                  {payingNo === i.no ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay"}
                </Button>
              )}
            </div>
          ))}
          {account.installments.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No fee plan has been set for your class yet.</p>}
        </CardContent>
      </Card>

      {/* History */}
      {account.payments.length > 0 && (
        <Card className="gap-0">
          <CardHeader className="pb-3"><CardTitle className="text-base">Payment history</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[...account.payments].reverse().map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{rupees(p.amount + p.lateFee)} · {p.method}</p>
                  <p className="truncate text-xs text-muted-foreground">{fmtDate(p.date)} · {p.txnId}</p>
                </div>
                {p.lateFee > 0 && <span className="shrink-0 text-xs text-red-600 dark:text-red-400">incl. {rupees(p.lateFee)} late fee</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">Questions about fees? Contact the accounts office or send a message from Messages & Notices.</p>
    </div>
  );
}
