import { useState } from "react";
import { useSearchParams } from "react-router";
import { CheckCircle2, FileCheck2, Landmark, PackageCheck, PackageX, Printer, Search } from "lucide-react";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/utils";
import { today } from "@/lib/dates";
import { printDocument } from "@/lib/print";
import {
  ACCOUNTS_STAGE, accountsStage, inr, round2, useGoodsReceipts, usePurchaseOrders, useVendors,
  type AccountsStage, type GoodsReceipt, type PurchaseOrder,
} from "@/store/procurement";
import { useSite } from "@/store/website";
import { grnHtml, Pill, ProcessRail, ReceiveDialog, unbilledValue, useRailSteps } from "../flow";

const STAGES: AccountsStage[] = ["AWAITING_BILL", "IN_REVIEW", "ON_HOLD", "AWAITING_PAYMENT", "PAID"];

/** The GRN register: every delivery received, what was rejected, and its journey through Accounts (bill → payment). */
export function GoodsReceipts() {
  const receipts = useGoodsReceipts();
  const orders = usePurchaseOrders();
  const vendors = useVendors();
  const rail = useRailSteps();
  const site = useSite();
  const [params, setParams] = useSearchParams();
  const accountsView = params.get("view") === "accounts";
  const [stage, setStage] = useState<AccountsStage | "all">("all");
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const po = (id: number) => orders.find((p) => p.id === id);
  const vendor = (id?: number) => vendors.find((v) => v.id === id);
  const school = { name: site.name, address: site.address, city: site.city, phone: site.phone };
  const openPos = orders.filter((p) => p.status === "SENT" || p.status === "PARTIALLY_RECEIVED");

  const valueOf = (g: GoodsReceipt) => {
    const p = po(g.poId);
    return round2(g.lines.reduce((s, l) => s + l.accepted * (p?.lines.find((x) => x.line === l.line)?.rate ?? 0), 0) * (1 + (p?.gstPercent ?? 0) / 100));
  };
  const received = receipts.reduce((s, g) => s + g.lines.reduce((t, l) => t + l.received, 0), 0);
  const rejected = receipts.reduce((s, g) => s + g.lines.reduce((t, l) => t + l.received - l.accepted, 0), 0);
  const billedPos = orders.filter((p) => p.status !== "CANCELLED" && accountsStage(p) !== "AWAITING_GOODS");

  const q = search.toLowerCase();
  const list = receipts
    .filter((g) => stage === "all" || accountsStage(po(g.poId)!) === stage)
    .filter((g) => !q || `${g.no} ${po(g.poId)?.no} ${vendor(po(g.poId)?.vendorId)?.name} ${g.challanNo}`.toLowerCase().includes(q));

  return (
    <div className="space-y-6">
      <PageHeader title="Goods Receipt Notes (GRN)" description="Deliveries checked into the store. Each GRN goes to Accounts, who match the vendor's bill to the PO and GRN, then pay (TDS deducted)."
        actions={<Button className="gap-2" disabled={!openPos.length} onClick={() => setPicking(true)}><PackageCheck className="h-4 w-4" /> New GRN</Button>} />
      <ProcessRail steps={rail} active={accountsView ? "accounts" : "grn"} />
      <MiniStats items={[
        { label: "GRNs this month", value: receipts.filter((g) => g.date.startsWith(today().slice(0, 7))).length, icon: FileCheck2, tone: "blue" },
        { label: "With Accounts, not billed", value: inr(billedPos.reduce((s, p) => s + unbilledValue(p), 0)), icon: Landmark, tone: "amber" },
        { label: "Rejected at QC", value: `${received ? Math.round((rejected / received) * 1000) / 10 : 0}% · ${rejected} units`, icon: PackageX, tone: "red" },
        { label: "Paid to vendors", value: inr(billedPos.flatMap((p) => p.bills).filter((b) => b.status === "PAID").reduce((s, b) => s + b.total, 0)), icon: CheckCircle2, tone: "green" },
      ]} />

      {/* Accounts pipeline: how many orders sit at each stage after their GRN */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STAGES.map((s) => {
          const ps = billedPos.filter((p) => accountsStage(p) === s);
          return (
            <button key={s} type="button" onClick={() => { setStage(stage === s ? "all" : s); if (!accountsView) setParams({ view: "accounts" }, { replace: true }); }}
              className={cn("rounded-xl border p-3 text-left transition-colors", stage === s ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent")}>
              <Pill className={ACCOUNTS_STAGE[s].className}>{ACCOUNTS_STAGE[s].label}</Pill>
              <p className="mt-2 text-xl font-semibold text-foreground">{ps.length}</p>
              <p className="text-xs text-muted-foreground">{inr(ps.reduce((t, p) => t + (s === "PAID" ? p.bills.reduce((x, b) => x + b.total, 0) : s === "AWAITING_BILL" ? unbilledValue(p) : p.bills.filter((b) => b.status !== "PAID").reduce((x, b) => x + b.total, 0)), 0))}</p>
            </button>
          );
        })}
      </div>

      <Card className="gap-0 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
            <p className="text-sm font-medium text-foreground">{stage === "all" ? "All GRNs" : ACCOUNTS_STAGE[stage].label} <span className="text-muted-foreground">({list.length})</span></p>
            {stage !== "all" && <Button variant="ghost" size="sm" onClick={() => setStage("all")}>Show all</Button>}
            <div className="relative sm:ml-auto sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 pl-9" placeholder="GRN, PO, vendor, challan…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-2.5 font-medium">GRN</th><th className="px-4 py-2.5 font-medium">Vendor · PO</th><th className="px-4 py-2.5 font-medium">Items</th><th className="px-4 py-2.5 text-right font-medium">Received / accepted</th><th className="px-4 py-2.5 text-right font-medium">Accepted value</th><th className="px-4 py-2.5 font-medium">In Accounts</th><th className="px-4 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((g) => {
                  const p = po(g.poId);
                  const v = vendor(p?.vendorId);
                  const s = p ? accountsStage(p) : "AWAITING_BILL";
                  const rec = g.lines.reduce((t, l) => t + l.received, 0);
                  const acc = g.lines.reduce((t, l) => t + l.accepted, 0);
                  return (
                    <tr key={g.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3"><p className="font-mono text-xs font-medium">{g.no}</p><p className="text-[11px] text-muted-foreground">{g.date} · challan {g.challanNo}</p></td>
                      <td className="px-4 py-3"><p className="text-foreground">{v?.name}</p><p className="font-mono text-[11px] text-muted-foreground">{v?.code} · {p?.no}</p></td>
                      <td className="max-w-[240px] px-4 py-3"><p className="truncate">{g.lines.map((l) => p?.lines.find((x) => x.line === l.line)?.name).join(", ")}</p><p className="text-[11px] text-muted-foreground">checked by {g.checkedBy}</p></td>
                      <td className="px-4 py-3 text-right tabular-nums">{rec} / <span className={cn(acc < rec && "font-medium text-amber-600")}>{acc}</span>{acc < rec && <p className="text-[11px] text-amber-600">{g.lines.filter((l) => l.rejectedReason).map((l) => l.rejectedReason).join("; ")}</p>}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{inr(valueOf(g))}</td>
                      <td className="px-4 py-3"><Pill className={ACCOUNTS_STAGE[s].className}>{ACCOUNTS_STAGE[s].label}</Pill>{p?.bills.length ? <p className="mt-0.5 text-[11px] text-muted-foreground">bill {p.bills.map((b) => b.billNo).join(", ")}</p> : null}</td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" className="gap-1" onClick={() => printDocument(`GRN ${g.no}`, grnHtml(g, p, v, school))}><Printer className="h-3.5 w-3.5" /> Print</Button></td>
                    </tr>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No goods receipts here.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Which order has arrived?</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {openPos.map((p) => (
              <button key={p.id} type="button" onClick={() => { setPicking(false); setReceiving(p); }} className="w-full rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-accent">
                <div className="flex justify-between gap-2"><span className="font-mono text-xs">{p.no}</span><span className={cn("text-xs", p.deliveryBy < today() ? "text-red-600" : "text-muted-foreground")}>due {p.deliveryBy}</span></div>
                <p className="font-medium text-foreground">{vendor(p.vendorId)?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.lines.map((l) => `${l.qty - l.received} ${l.unit} ${l.name}`).join(", ")}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {receiving && <ReceiveDialog po={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}
