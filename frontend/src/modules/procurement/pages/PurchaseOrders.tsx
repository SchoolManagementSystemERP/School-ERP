import { useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, CalendarClock, FileCheck2, PackageCheck, Printer, Search, ShoppingCart, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/components/ui/utils";
import { today } from "@/lib/dates";
import { printDocument } from "@/lib/print";
import {
  ACCOUNTS_STAGE, accountsStage, cancelPurchaseOrder, inr, poTotal, receivedValue, useGoodsReceipts, useIndents, usePurchaseOrders, useVendors, type PurchaseOrder,
} from "@/store/procurement";
import { useSite } from "@/store/website";
import { ErrorText, useAction } from "../components";
import { grnHtml, Pill, PO_STATUS, poHtml, ProcessRail, ReceiveDialog, STORE, useRailSteps } from "../flow";

const FILTERS = [
  { key: "open", label: "Awaiting delivery", match: (p: PurchaseOrder) => p.status === "SENT" || p.status === "PARTIALLY_RECEIVED" },
  { key: "late", label: "Overdue", match: (p: PurchaseOrder) => (p.status === "SENT" || p.status === "PARTIALLY_RECEIVED") && p.deliveryBy < today() },
  { key: "received", label: "Received", match: (p: PurchaseOrder) => p.status === "RECEIVED" },
  { key: "all", label: "All", match: () => true },
] as const;

const delivered = (p: PurchaseOrder) => {
  const qty = p.lines.reduce((s, l) => s + l.qty, 0);
  return qty ? Math.round((p.lines.reduce((s, l) => s + l.received, 0) / qty) * 100) : 0;
};

/** Purchase orders: what has been ordered, from whom, delivery progress, GRNs and where each stands in Accounts. */
export function PurchaseOrders() {
  const orders = usePurchaseOrders();
  const vendors = useVendors();
  const indents = useIndents();
  const rail = useRailSteps();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const vendor = (id: number) => vendors.find((v) => v.id === id);
  const live = orders.filter((p) => p.status !== "CANCELLED");
  const open = orders.find((p) => p.id === openId) ?? null;

  const q = search.toLowerCase();
  const list = orders.filter(FILTERS.find((f) => f.key === filter)!.match).filter((p) => !q || `${p.no} ${vendor(p.vendorId)?.name} ${vendor(p.vendorId)?.code} ${p.lines.map((l) => l.name).join(" ")}`.toLowerCase().includes(q));
  const month = today().slice(0, 7);

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Orders" description="Orders sent to vendors. Record the goods receipt (GRN) when a delivery arrives — it goes to Accounts for billing." />
      <ProcessRail steps={rail} active="po" />
      <MiniStats items={[
        { label: "Awaiting delivery", value: live.filter(FILTERS[0].match).length, icon: Truck, tone: "blue" },
        { label: "Overdue deliveries", value: live.filter(FILTERS[1].match).length, icon: AlertTriangle, tone: "red" },
        { label: "Ordered this month", value: inr(live.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + poTotal(p), 0)), icon: ShoppingCart, tone: "violet" },
        { label: "Open order value", value: inr(live.filter(FILTERS[0].match).reduce((s, p) => s + poTotal(p) - receivedValue(p).total, 0)), icon: CalendarClock, tone: "amber" },
      ]} />

      <Card className="gap-0">
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cn("rounded-full border px-3 py-1 text-sm", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent")}>
                {f.label} <span className="ml-1 tabular-nums opacity-80">{orders.filter(f.match).length}</span>
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="PO no., vendor, item…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((p) => {
          const v = vendor(p.vendorId);
          const pct = delivered(p);
          const late = FILTERS[1].match(p);
          const stage = accountsStage(p);
          return (
            <Card key={p.id} className={cn("cursor-pointer gap-0 transition hover:border-primary/40 hover:shadow-sm", late && "border-red-500/40")} onClick={() => setOpenId(p.id)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{p.no} · {p.date}</p>
                    <p className="truncate font-semibold text-foreground">{v?.name ?? "—"} <span className="font-mono text-xs font-normal text-muted-foreground">{v?.code}</span></p>
                    <p className="truncate text-sm text-muted-foreground">{p.lines.map((l) => `${l.qty} ${l.unit} ${l.name}`).join(", ")}</p>
                  </div>
                  <p className="shrink-0 text-lg font-semibold text-foreground">{inr(poTotal(p))}</p>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Delivered {pct}%</span><span className={cn(late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{late ? "Overdue · " : ""}due {p.deliveryBy}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill className={PO_STATUS[p.status].className}>{PO_STATUS[p.status].label}</Pill>
                  {p.status !== "CANCELLED" && stage !== "AWAITING_GOODS" && <Pill className={ACCOUNTS_STAGE[stage].className}>{ACCOUNTS_STAGE[stage].label}</Pill>}
                  {(p.status === "SENT" || p.status === "PARTIALLY_RECEIVED") && (
                    <Button size="sm" className="ml-auto h-8 gap-1" onClick={(e) => { e.stopPropagation(); setReceiving(p); }}><PackageCheck className="h-4 w-4" /> Record GRN</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {list.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          <ShoppingCart className="mx-auto mb-2 h-6 w-6" />No purchase orders here. POs are created from an approved PR after comparing quotations — <Link className="text-primary underline" to="/inventory/requisitions?view=quotes">open quotations</Link>.
        </CardContent></Card>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {open && <PODetail po={open} indentNo={indents.find((i) => i.id === open.indentId)?.no} onReceive={() => setReceiving(open)} />}
        </SheetContent>
      </Sheet>
      {receiving && <ReceiveDialog po={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}

function PODetail({ po, indentNo, onReceive }: { po: PurchaseOrder; indentNo?: string; onReceive: () => void }) {
  const vendor = useVendors().find((v) => v.id === po.vendorId);
  const indent = useIndents().find((i) => i.id === po.indentId);
  const grns = useGoodsReceipts().filter((g) => g.poId === po.id);
  const site = useSite();
  const cancel = useAction();
  const [reason, setReason] = useState("");
  const school = { name: site.name, address: site.address, city: site.city, phone: site.phone };
  const sub = po.lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const stage = accountsStage(po);
  const open = po.status === "SENT" || po.status === "PARTIALLY_RECEIVED";

  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex flex-wrap items-center gap-2 pr-8"><SheetTitle className="font-mono">{po.no}</SheetTitle><Pill className={PO_STATUS[po.status].className}>{PO_STATUS[po.status].label}</Pill></div>
        <SheetDescription>{vendor?.code} · {vendor?.name} · against {indentNo} · ordered {po.date}, due {po.deliveryBy}</SheetDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => printDocument(`Purchase order ${po.no}`, poHtml(po, vendor, indent, school))}><Printer className="h-4 w-4" /> Print PO</Button>
          {open && <Button size="sm" className="gap-1" onClick={onReceive}><PackageCheck className="h-4 w-4" /> Record GRN</Button>}
        </div>
      </SheetHeader>
      <div className="space-y-6 p-4">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Order lines</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 text-right font-medium">Ordered</th><th className="px-3 py-2 text-right font-medium">Received</th><th className="px-3 py-2 text-right font-medium">Accepted</th><th className="px-3 py-2 text-right font-medium">Rate</th><th className="px-3 py-2 text-right font-medium">Amount</th></tr></thead>
              <tbody className="divide-y divide-border">
                {po.lines.map((l) => (
                  <tr key={l.line}><td className="px-3 py-2">{l.name}</td><td className="px-3 py-2 text-right tabular-nums">{l.qty} {l.unit}</td><td className="px-3 py-2 text-right tabular-nums">{l.received}</td><td className={cn("px-3 py-2 text-right tabular-nums", l.accepted < l.received && "text-amber-600")}>{l.accepted}</td><td className="px-3 py-2 text-right tabular-nums">{inr(l.rate)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(l.qty * l.rate)}</td></tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr className="border-t border-border"><td colSpan={5} className="px-3 py-1.5 text-right text-muted-foreground">Subtotal</td><td className="px-3 py-1.5 text-right tabular-nums">{inr(sub)}</td></tr>
                <tr><td colSpan={5} className="px-3 py-1.5 text-right text-muted-foreground">GST {po.gstPercent}%</td><td className="px-3 py-1.5 text-right tabular-nums">{inr((sub * po.gstPercent) / 100)}</td></tr>
                <tr><td colSpan={5} className="px-3 py-1.5 text-right font-semibold">Total</td><td className="px-3 py-1.5 text-right font-semibold tabular-nums">{inr(poTotal(po))}</td></tr>
              </tfoot>
            </table>
          </div>
          {po.selectionNote && <p className="text-xs text-muted-foreground">Vendor choice: {po.selectionNote}</p>}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Goods receipts ({grns.length})</h3>
          {grns.length === 0 && <p className="text-sm text-muted-foreground">Nothing received yet.</p>}
          {grns.map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <FileCheck2 className="h-5 w-5 text-emerald-600" />
              <div className="min-w-0 flex-1"><p className="font-mono text-xs font-medium">{g.no}</p><p className="text-xs text-muted-foreground">{g.date} · challan {g.challanNo} · {g.lines.reduce((s, l) => s + l.accepted, 0)} accepted of {g.lines.reduce((s, l) => s + l.received, 0)}</p></div>
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => printDocument(`GRN ${g.no}`, grnHtml(g, po, vendor, school))}><Printer className="h-3.5 w-3.5" /> Print</Button>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Accounts</h3>
          <div className="flex items-center gap-2"><Pill className={ACCOUNTS_STAGE[stage].className}>{ACCOUNTS_STAGE[stage].label}</Pill><span className="text-xs text-muted-foreground">billable so far {inr(receivedValue(po).total)}</span></div>
          {po.bills.map((b) => (
            <div key={b.billNo} className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"><span>Bill {b.billNo} · {b.billDate}</span><span className="tabular-nums">{inr(b.total)} · {b.status === "PAID" ? `paid ${b.paidOn}` : b.status.toLowerCase().replace("_", " ")}</span></div>
          ))}
        </section>

        {po.status === "SENT" && (
          <section className="space-y-2 rounded-lg border border-red-500/30 p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300"><XCircle className="h-4 w-4" /> Cancel this order</h3>
            <p className="text-xs text-muted-foreground">Only while nothing has been received. The PR goes back to quotations.</p>
            <div className="flex gap-2"><Input placeholder="Reason (e.g. vendor cannot supply)" value={reason} onChange={(e) => setReason(e.target.value)} /><Button variant="outline" disabled={!reason.trim() || cancel.busy} onClick={() => cancel.run(() => cancelPurchaseOrder(po.id, STORE, reason), () => toast.success(`${po.no} cancelled`))}>Cancel PO</Button></div>
            <ErrorText error={cancel.error} />
          </section>
        )}
      </div>
    </>
  );
}
