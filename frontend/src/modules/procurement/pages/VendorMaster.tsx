import { useState } from "react";
import { Building2, Clock, LayoutGrid, List, Mail, Pencil, Phone, Plus, Search, ShieldCheck, Star, Users } from "lucide-react";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/components/ui/utils";
import { inr, poTotal, useGoodsReceipts, usePurchaseOrders, useVendors, type GoodsReceipt, type PurchaseOrder, type Vendor } from "@/store/procurement";
import { blankVendor, Pill, PO_STATUS, VendorDialog, type VendorDraft } from "../flow";

interface Scorecard { orders: number; spend: number; onTime: number | null; rejection: number | null; lastOrder: string | null }

/** Delivery and quality record of a vendor, from its POs and GRNs. */
function scorecard(v: Vendor, orders: PurchaseOrder[], receipts: GoodsReceipt[]): Scorecard {
  const pos = orders.filter((p) => p.vendorId === v.id && p.status !== "CANCELLED");
  const delivered = pos.map((p) => ({ p, first: receipts.filter((g) => g.poId === p.id).map((g) => g.date).sort()[0] })).filter((x) => x.first);
  const lines = receipts.filter((g) => pos.some((p) => p.id === g.poId)).flatMap((g) => g.lines);
  const rec = lines.reduce((s, l) => s + l.received, 0);
  return {
    orders: pos.length, spend: pos.reduce((s, p) => s + poTotal(p), 0),
    onTime: delivered.length ? Math.round((delivered.filter((x) => x.first! <= x.p.deliveryBy).length / delivered.length) * 100) : null,
    rejection: rec ? Math.round(((rec - lines.reduce((s, l) => s + l.accepted, 0)) / rec) * 1000) / 10 : null,
    lastOrder: pos.map((p) => p.date).sort().at(-1) ?? null,
  };
}

const rating = (s: Scorecard) => (s.onTime == null ? null : Math.max(1, Math.min(5, Math.round((s.onTime / 100) * 3 + (1 - Math.min(1, (s.rejection ?? 0) / 10)) * 2))));

/** Vendor master: vendor codes, tax and bank details, and each vendor's delivery and quality record. */
export function VendorMaster() {
  const vendors = useVendors();
  const orders = usePurchaseOrders();
  const receipts = useGoodsReceipts();
  const [draft, setDraft] = useState<VendorDraft | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const [openId, setOpenId] = useState<number | null>(null);
  const scores = new Map(vendors.map((v) => [v.id, scorecard(v, orders, receipts)]));
  const open = vendors.find((v) => v.id === openId) ?? null;

  const q = search.toLowerCase();
  const list = vendors
    .filter((v) => status === "all" || (status === "active" ? v.active : !v.active))
    .filter((v) => !q || `${v.code} ${v.name} ${v.category} ${v.gstin} ${v.phone}`.toLowerCase().includes(q))
    .sort((a, b) => scores.get(b.id)!.spend - scores.get(a.id)!.spend || a.code.localeCompare(b.code));
  const rated = vendors.map((v) => scores.get(v.id)!).filter((s) => s.onTime != null);

  return (
    <div className="space-y-6">
      <PageHeader title="Vendor Master" description="Registered suppliers with their vendor code, GST, PAN, bank and TDS details — and how well they deliver."
        actions={<Button className="gap-2" onClick={() => setDraft(blankVendor())}><Plus className="h-4 w-4" /> New vendor</Button>} />
      <MiniStats items={[
        { label: "Active vendors", value: vendors.filter((v) => v.active).length, icon: Users, tone: "blue" },
        { label: "Spend (all orders)", value: inr(vendors.reduce((s, v) => s + scores.get(v.id)!.spend, 0)), icon: Building2, tone: "violet" },
        { label: "On-time delivery", value: rated.length ? `${Math.round(rated.reduce((s, x) => s + x.onTime!, 0) / rated.length)}%` : "—", icon: Clock, tone: "green" },
        { label: "With GSTIN", value: `${vendors.filter((v) => v.gstin).length}/${vendors.length}`, icon: ShieldCheck, tone: "amber" },
      ]} />

      <Card className="gap-0">
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search code, name, GSTIN, phone…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="flex gap-1.5">
            {(["active", "inactive", "all"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={cn("rounded-full border px-3 py-1 text-sm capitalize", status === s ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent")}>{s}</button>
            ))}
          </div>
          <div className="flex rounded-lg border border-border p-0.5">
            <Button size="icon" variant={layout === "cards" ? "secondary" : "ghost"} className="h-8 w-8" aria-label="Cards" onClick={() => setLayout("cards")}><LayoutGrid className="h-4 w-4" /></Button>
            <Button size="icon" variant={layout === "table" ? "secondary" : "ghost"} className="h-8 w-8" aria-label="Table" onClick={() => setLayout("table")}><List className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {layout === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => {
            const s = scores.get(v.id)!;
            const r = rating(s);
            return (
              <Card key={v.id} className={cn("cursor-pointer gap-0 transition hover:border-primary/40 hover:shadow-sm", !v.active && "opacity-60")} onClick={() => setOpenId(v.id)}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary">{v.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium">{v.code || "—"}</span>{!v.active && <Pill className="bg-muted text-muted-foreground">Inactive</Pill>}</div>
                      <p className="mt-1 truncate font-semibold text-foreground">{v.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{v.category || "General supplies"}</p>
                    </div>
                    {r && <div className="flex items-center gap-0.5 text-xs font-medium text-amber-600"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{r}.0</div>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
                    <div><p className="text-sm font-semibold">{s.orders}</p><p className="text-[10px] text-muted-foreground">Orders</p></div>
                    <div><p className="text-sm font-semibold">{s.onTime == null ? "—" : `${s.onTime}%`}</p><p className="text-[10px] text-muted-foreground">On time</p></div>
                    <div><p className="text-sm font-semibold">{s.rejection == null ? "—" : `${s.rejection}%`}</p><p className="text-[10px] text-muted-foreground">Rejected</p></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="font-mono">{v.gstin || "No GSTIN"}</span><span className="font-medium text-foreground">{inr(s.spend)}</span></div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-medium">Code</th><th className="px-4 py-2.5 font-medium">Vendor</th><th className="px-4 py-2.5 font-medium">GSTIN / PAN</th><th className="px-4 py-2.5 font-medium">TDS</th><th className="px-4 py-2.5 text-right font-medium">Orders</th><th className="px-4 py-2.5 text-right font-medium">Spend</th><th className="px-4 py-2.5 text-right font-medium">On time</th><th className="px-4 py-2.5 text-right font-medium">Rejected</th></tr></thead>
              <tbody className="divide-y divide-border">
                {list.map((v) => {
                  const s = scores.get(v.id)!;
                  return (
                    <tr key={v.id} className={cn("cursor-pointer hover:bg-accent/40", !v.active && "opacity-60")} onClick={() => setOpenId(v.id)}>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">{v.code}</td>
                      <td className="px-4 py-2.5"><p className="font-medium">{v.name}</p><p className="text-xs text-muted-foreground">{v.category}</p></td>
                      <td className="px-4 py-2.5 font-mono text-xs">{v.gstin || "—"}<br />{v.pan || "—"}</td>
                      <td className="px-4 py-2.5">{v.tdsSection}{v.isIndividual ? " (1%)" : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.orders}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{inr(s.spend)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.onTime == null ? "—" : `${s.onTime}%`}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.rejection == null ? "—" : `${s.rejection}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {list.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No vendors match.</CardContent></Card>}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {open && (
            <>
              <SheetHeader className="border-b border-border">
                <div className="flex items-center gap-2 pr-8"><span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">{open.code}</span><SheetTitle>{open.name}</SheetTitle></div>
                <SheetDescription>{open.category || "General supplies"}{open.active ? "" : " · inactive"}</SheetDescription>
                <div><Button size="sm" variant="outline" className="gap-1" onClick={() => { setDraft({ ...open }); setOpenId(null); }}><Pencil className="h-3.5 w-3.5" /> Edit vendor</Button></div>
              </SheetHeader>
              <div className="space-y-5 p-4 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[["GSTIN", open.gstin || "—"], ["PAN", open.pan || "—"], ["TDS", `${open.tdsSection}${open.isIndividual ? " · individual (1%)" : ""}`], ["Bank", open.bankName ? `${open.bankName} · ${open.ifsc} · ****${open.accountNo.slice(-4)}` : "—"]].map(([k, val]) => (
                    <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-mono text-[13px]">{val}</dd></div>
                  ))}
                  <div className="col-span-2 flex flex-wrap gap-4 text-muted-foreground">{open.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{open.phone}</span>}{open.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{open.email}</span>}</div>
                  {open.address && <p className="col-span-2 text-muted-foreground">{open.address}</p>}
                </dl>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(() => { const s = scores.get(open.id)!; return [["Orders", s.orders], ["Spend", inr(s.spend)], ["On time", s.onTime == null ? "—" : `${s.onTime}%`], ["Rejected", s.rejection == null ? "—" : `${s.rejection}%`]].map(([k, val]) => <div key={k as string} className="rounded-lg bg-muted/40 p-2"><p className="font-semibold">{val}</p><p className="text-[11px] text-muted-foreground">{k}</p></div>); })()}
                </div>
                <section className="space-y-2">
                  <h3 className="font-semibold">Purchase orders</h3>
                  {orders.filter((p) => p.vendorId === open.id).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                      <div className="min-w-0"><p className="font-mono text-xs">{p.no} · {p.date}</p><p className="truncate text-xs text-muted-foreground">{p.lines.map((l) => l.name).join(", ")}</p></div>
                      <div className="text-right"><p className="font-medium tabular-nums">{inr(poTotal(p))}</p><Pill className={PO_STATUS[p.status].className}>{PO_STATUS[p.status].label}</Pill></div>
                    </div>
                  ))}
                  {!orders.some((p) => p.vendorId === open.id) && <p className="text-muted-foreground">No orders yet.</p>}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <VendorDialog draft={draft} setDraft={setDraft} />
    </div>
  );
}
