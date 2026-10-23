import { useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, FileInput, Landmark, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { cn } from "@/components/ui/utils";
import { today } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/store/finance";
import {
  decideBill, inr, payBill, pettyCashBalance, receivedValue, recordBill, round2, spendPettyCash, tdsFor, topUpPettyCash,
  useIndents, usePettyCash, useProcurementSettings, usePurchaseOrders, useVendorBills, useVendorPayments, useVendors,
  type BillStatus, type PurchaseOrder, type VendorBill, type VendorPayment,
} from "@/store/procurement";
import { ErrorText, useAction } from "../components";

const BILL_TONE: Record<BillStatus, string> = {
  MATCHED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  MISMATCH: "bg-red-500/10 text-red-700 dark:text-red-300",
  APPROVED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  PAID: "bg-muted text-muted-foreground",
  ON_HOLD: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};
const BILL_LABEL: Record<BillStatus, string> = { MATCHED: "Matches PO + GRN", MISMATCH: "Does not match", APPROVED: "Approved to pay", PAID: "Paid", ON_HOLD: "On hold" };

function EnterBill({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const bills = useVendorBills();
  const received = receivedValue(po);
  const billed = bills.filter((b) => b.poId === po.id && b.status !== "ON_HOLD").reduce((s, b) => s + b.total, 0);
  const remaining = round2(received.total - billed);
  const [f, setF] = useState({ billNo: "", billDate: today(), subtotal: String(round2(remaining / (1 + po.gstPercent / 100))), gst: String(round2(remaining - remaining / (1 + po.gstPercent / 100))) });
  const { error, run } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Enter vendor bill — {po.no}</DialogTitle></DialogHeader>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p>Received and accepted (GRN) at PO rates: <b>{inr(received.total)}</b>{billed > 0 && <> · already billed {inr(billed)}</>}</p>
          <p className="text-muted-foreground">Type the amounts exactly as printed on the vendor's bill — the system checks them against the PO and the goods receipt.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label>Vendor's bill no.</Label><Input value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} /></div>
          <div className="space-y-2"><Label>Bill date</Label><Input type="date" value={f.billDate} onChange={(e) => setF({ ...f, billDate: e.target.value })} /></div>
          <div className="space-y-2"><Label>Taxable amount (₹)</Label><Input type="number" value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} /></div>
          <div className="space-y-2"><Label>GST (₹)</Label><Input type="number" value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })} /></div>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => run(async () => { const b = await recordBill({ poId: po.id, billNo: f.billNo, billDate: f.billDate, subtotal: Number(f.subtotal), gst: Number(f.gst) }); toast[b.status === "MATCHED" ? "success" : "warning"](b.status === "MATCHED" ? "Bill matches PO and GRN" : `Bill does not match — expected ${inr(b.expected)}, billed ${inr(b.total)}`); }, onClose)}>Save bill</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ bill, onClose }: { bill: VendorBill; onClose: () => void }) {
  const vendor = useVendors().find((v) => v.id === bill.vendorId)!;
  const tds = tdsFor(bill, vendor);
  const [f, setF] = useState({ mode: "NEFT" as VendorPayment["mode"], reference: "", date: today() });
  const { error, run } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Pay {vendor.name}</DialogTitle></DialogHeader>
        <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Bill {bill.billNo} (incl. GST)</span><span className="tabular-nums">{inr(bill.total)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">TDS {tds.section === "None" ? "— not applicable" : `u/s ${tds.section} @ ${tds.rate}% on ${inr(bill.subtotal)}`}</span><span className="tabular-nums">− {inr(tds.amount)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Pay to vendor</span><span className="tabular-nums">{inr(round2(bill.total - tds.amount))}</span></div>
          {tds.section !== "None" && tds.amount === 0 && <p className="text-xs text-muted-foreground">Below the single-bill TDS threshold — no TDS on this bill.</p>}
        </div>
        <p className="text-xs text-muted-foreground">To {vendor.bankName} · {vendor.ifsc} · A/c ****{vendor.accountNo.slice(-4)}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={f.mode} onValueChange={(v: VendorPayment["mode"]) => setF({ ...f, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="NEFT">NEFT / RTGS</SelectItem><SelectItem value="Cheque">Cheque</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>{f.mode === "Cheque" ? "Cheque no." : "UTR / reference"}</Label><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => run(async () => { const p = await payBill(bill.id, f); toast.success(`Paid ${inr(p.net)}${p.tds ? ` · TDS ${inr(p.tds)} to deposit` : ""} — booked in Expenses`); }, onClose)}>Record payment</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PettyCash() {
  const vouchers = usePettyCash();
  const settings = useProcurementSettings();
  const balance = pettyCashBalance(vouchers);
  const [f, setF] = useState({ purpose: "", paidTo: "", category: "Stationery", amount: "", date: today() });
  const { error, run } = useAction();
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm text-muted-foreground">Cash in the petty cash box</p>
            <p className="font-display text-3xl font-semibold tabular-nums">{inr(balance)}</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (balance / settings.pettyCashFloat) * 100)}%` }} /></div>
            <p className="text-xs text-muted-foreground">Float {inr(settings.pettyCashFloat)} · up to {inr(settings.pettyCashVoucherLimit)} per spend</p>
            <Button size="sm" variant="outline" disabled={balance >= settings.pettyCashFloat} onClick={() => run(async () => { const n = await topUpPettyCash("Principal"); toast.success(`Topped up ${inr(n)} from the bank`); })}>Top up to {inr(settings.pettyCashFloat)}</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">New petty cash voucher</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="space-y-2"><Label>What for</Label><Input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Courier to CBSE office" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Paid to</Label><Input value={f.paidTo} onChange={(e) => setF({ ...f, paidTo: e.target.value })} /></div>
              <div className="space-y-2"><Label>Amount (₹)</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            </div>
            <ErrorText error={error} />
            <Button className="gap-2" onClick={() => run(() => spendPettyCash({ ...f, amount: Number(f.amount), approvedBy: "Accountant" }), () => { toast.success("Voucher saved — booked in Expenses"); setF({ ...f, purpose: "", paidTo: "", amount: "" }); })}><Plus className="h-4 w-4" />Save voucher</Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Petty cash book</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Details</th><th className="px-4 py-2 text-right font-medium">In</th><th className="px-4 py-2 text-right font-medium">Out</th></tr></thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{v.date}</td>
                  <td className="px-4 py-2"><p className="text-foreground">{v.purpose}</p><p className="text-xs text-muted-foreground">{v.paidTo}{v.kind === "spend" ? ` · ${v.category}` : ""}</p></td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{v.kind === "topup" ? inr(v.amount) : ""}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{v.kind === "spend" ? inr(v.amount) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AccountsPayables() {
  const orders = usePurchaseOrders();
  const bills = useVendorBills();
  const payments = useVendorPayments();
  const vendors = useVendors();
  const indents = useIndents();
  const [billFor, setBillFor] = useState<PurchaseOrder | null>(null);
  const [payFor, setPayFor] = useState<VendorBill | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const decide = useAction();
  const vendorName = (id: number) => vendors.find((v) => v.id === id)?.name ?? "—";

  const unbilled = orders.filter((p) => p.status !== "CANCELLED").map((p) => ({ p, left: round2(receivedValue(p).total - bills.filter((b) => b.poId === p.id && b.status !== "ON_HOLD").reduce((s, b) => s + b.total, 0)) })).filter((x) => x.left > 1);
  const open = bills.filter((b) => b.status !== "PAID");
  const due = open.filter((b) => b.status === "MATCHED" || b.status === "APPROVED");
  const month = today().slice(0, 7);
  const tdsThisMonth = payments.filter((p) => p.date.slice(0, 7) === month && p.tds > 0);
  const tdsBySection = tdsThisMonth.reduce<Record<string, number>>((m, p) => ({ ...m, [p.tdsSection]: (m[p.tdsSection] ?? 0) + p.tds }), {});
  const [y, m] = month.split("-").map(Number);
  const tdsDue = `7 ${new Date(y, m, 7).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Vendor bills & payments" description="Bills are paid only after the goods are received and the bill matches the purchase order" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Goods received, no bill yet" value={unbilled.length} icon={FileInput} tone="blue" hint={inr(unbilled.reduce((s, x) => s + x.left, 0))} />
        <StatCard label="Ready to pay" value={due.length} icon={CheckCircle2} tone="green" hint={inr(due.reduce((s, b) => s + b.total, 0))} />
        <StatCard label="Mismatched / on hold" value={open.filter((b) => b.status === "MISMATCH" || b.status === "ON_HOLD").length} icon={AlertTriangle} tone="red" />
        <StatCard label="TDS to deposit" value={inr(tdsThisMonth.reduce((s, p) => s + p.tds, 0))} icon={Landmark} tone="amber" hint={`by ${tdsDue}`} />
      </div>

      <Tabs defaultValue="bills">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="bills">Bills ({open.length + unbilled.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments & TDS ({payments.length})</TabsTrigger>
          <TabsTrigger value="petty">Petty cash</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="mt-4 space-y-4">
          {unbilled.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Goods received — waiting for the vendor's bill</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {unbilled.map(({ p, left }) => (
                  <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-medium text-foreground">{p.no} · {vendorName(p.vendorId)}</p><p className="text-sm text-muted-foreground">{indents.find((i) => i.id === p.indentId)?.location} · billable {inr(left)}</p></div>
                    <Button size="sm" className="gap-1.5" onClick={() => setBillFor(p)}><FileInput className="h-4 w-4" />Enter bill</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <ErrorText error={decide.error} />
          {open.length === 0 && unbilled.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No bills pending.</CardContent></Card>}
          {open.map((b) => {
            const po = orders.find((p) => p.id === b.poId);
            return (
              <Card key={b.id} className="gap-0">
                <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{vendorName(b.vendorId)}</p>
                      <Badge variant="outline">Bill {b.billNo}</Badge>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", BILL_TONE[b.status])}>{BILL_LABEL[b.status]}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{po?.no} · bill date {b.billDate} · billed <b className="text-foreground">{inr(b.total)}</b> · PO × GRN {inr(b.expected)}{b.note && ` · "${b.note}"`}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(b.status === "MISMATCH" || b.status === "ON_HOLD") && <Input className="h-8 w-56" placeholder="Reason to pay anyway" value={notes[b.id] ?? ""} onChange={(e) => setNotes({ ...notes, [b.id]: e.target.value })} aria-label="Reason" />}
                    {(b.status === "MISMATCH" || b.status === "ON_HOLD") && <Button size="sm" variant="outline" onClick={() => decide.run(() => decideBill(b.id, "approve", notes[b.id] ?? ""), () => toast.success("Bill approved"))}>Approve</Button>}
                    {b.status !== "ON_HOLD" && <Button size="sm" variant="outline" onClick={() => decide.run(() => decideBill(b.id, "hold", notes[b.id] ?? "Held by accounts"), () => toast.success("Bill put on hold"))}>Hold</Button>}
                    {(b.status === "MATCHED" || b.status === "APPROVED") && <Button size="sm" className="gap-1.5" onClick={() => setPayFor(b)}><Banknote className="h-4 w-4" />Pay</Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-4">
          {Object.keys(tdsBySection).length > 0 && (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm">
                <Wallet className="h-5 w-5 text-amber-600" />
                <span>TDS deducted in {new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long" })}: {Object.entries(tdsBySection).map(([s, v]) => `${s} ${inr(v)}`).join(" · ")} — deposit with challan 281 by {tdsDue}; file in Form 26Q for the quarter.</span>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Vendor</th><th className="px-4 py-3 font-medium">Bill</th><th className="px-4 py-3 text-right font-medium">Gross</th><th className="px-4 py-3 text-right font-medium">TDS</th><th className="px-4 py-3 text-right font-medium">Paid</th><th className="px-4 py-3 font-medium">Mode / ref</th></tr></thead>
                <tbody>
                  {payments.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No vendor payments yet.</td></tr>}
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.date}</td>
                      <td className="px-4 py-3 text-foreground">{vendorName(p.vendorId)}</td>
                      <td className="px-4 py-3">{bills.find((b) => b.id === p.billId)?.billNo}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{inr(p.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.tds ? `${inr(p.tds)} (${p.tdsSection})` : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{inr(p.net)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.mode} · {p.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="petty" className="mt-4"><PettyCash /></TabsContent>
      </Tabs>

      {billFor && <EnterBill po={billFor} onClose={() => setBillFor(null)} />}
      {payFor && <PayDialog bill={payFor} onClose={() => setPayFor(null)} />}
    </div>
  );
}
