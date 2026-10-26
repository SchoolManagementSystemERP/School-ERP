import { useState } from "react";
import { Link } from "react-router";
import { StockFlowChart } from "../charts";
import { AlertTriangle, Boxes, ClipboardList, Download, IndianRupee, PackageX, RefreshCcw, Search } from "lucide-react";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/components/ui/utils";
import { fmtDate, rupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "@/store/inventory";

type Movement = "FAST" | "SLOW" | "NON_MOVING";
interface Item {
  id: string; sku: string; name: string; category: string; unit: string; location: string | null; quantity: number; minQuantity: number; unitPrice: number; value: number;
  consumptionValue: number; issuedLastYear: number; receivedLastYear: number; monthlyUse: number; daysOfCover: number | null; movement: Movement; lastIssued: string | null; reorderQty: number; abc: "A" | "B" | "C";
}
interface Analysis {
  totals: { items: number; stockValue: number; consumptionValue: number; lowStock: number; toReorder: number; deadStockValue: number };
  abc: Record<"A" | "B" | "C", number>; movement: Record<Movement, number>;
  categories: { name: string; items: number; value: number; consumptionValue: number }[];
  consumption: { month: string; issued: number; received: number }[];
  items: Item[];
}

const MOVEMENT: Record<Movement, { label: string; className: string }> = {
  FAST: { label: "Fast moving", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  SLOW: { label: "Slow moving", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  NON_MOVING: { label: "Non-moving", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
};
const ABC_HINT ={ A: "top 70% of consumption — control tightly", B: "next 20%", C: "last 10% — keep simple" };

/** Full stock analysis: valuation, ABC, movement (FSN), consumption trend, stock cover and reorder list. */
export function StockAnalysis() {
  const [months, setMonths] = useState("6");
  const { data, reload, loading } = useApi<Analysis>(`/inventory/analysis?months=${months}`);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "reorder" | "A" | "B" | "C" | Movement>("all");
  if (!data) return null;
  const t = data.totals;
  const q = search.toLowerCase();
  const items = data.items.filter((i) =>
    (view === "all" || (view === "reorder" ? i.reorderQty > 0 : view.length === 1 ? i.abc === view : i.movement === view)) &&
    (!q || `${i.name} ${i.sku} ${i.category}`.toLowerCase().includes(q)));
  const maxCat = Math.max(1, ...data.categories.map((c) => c.value));

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Analysis" description="Valuation, ABC (by consumption value), fast / slow / non-moving items, stock cover and what to reorder."
        actions={
          <div className="flex gap-2">
            <Select value={months} onValueChange={setMonths}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{["3", "6", "12"].map((m) => <SelectItem key={m} value={m}>Last {m} months</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => void reload()} disabled={loading}><RefreshCcw className="h-4 w-4" /></Button>
            {t.toReorder > 0 && <Button className="gap-2" asChild><Link to="/inventory/requisitions?new=reorder"><ClipboardList className="h-4 w-4" /> Raise reorder PR</Link></Button>}
          </div>
        } />
      <MiniStats items={[
        { label: `Stock value · ${t.items} items`, value: rupees(t.stockValue), icon: IndianRupee, tone: "blue" },
        { label: "Used in 12 months", value: rupees(t.consumptionValue), icon: Boxes, tone: "violet" },
        { label: `To reorder (${t.lowStock} below minimum)`, value: t.toReorder, icon: AlertTriangle, tone: "amber" },
        { label: "Dead stock (90+ days unused)", value: rupees(t.deadStockValue), icon: PackageX, tone: "red" },
      ]} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="gap-0 xl:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Stock in vs stock out (₹ per month)</CardTitle></CardHeader>
          <CardContent><StockFlowChart data={data.consumption} height={300} /></CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader className="pb-3"><CardTitle className="text-base">ABC & movement</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              {(["A", "B", "C"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setView(view === k ? "all" : k)} className={cn("flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm", view === k ? "border-primary bg-primary/5" : "border-border hover:bg-accent")}>
                  <span className="font-display text-lg font-semibold">{k}</span><span className="flex-1 text-xs text-muted-foreground">{ABC_HINT[k]}</span><span className="font-semibold tabular-nums">{data.abc[k]}</span>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              {(Object.keys(MOVEMENT) as Movement[]).map((k) => (
                <button key={k} type="button" onClick={() => setView(view === k ? "all" : k)} className={cn("flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm", view === k ? "border-primary bg-primary/5" : "border-border hover:bg-accent")}>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", MOVEMENT[k].className)}>{MOVEMENT[k].label}</span><span className="font-semibold tabular-nums">{data.movement[k]}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0">
        <CardHeader className="pb-3"><CardTitle className="text-base">Value by category</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          {data.categories.map((c) => (
            <div key={c.name} className="text-sm">
              <div className="flex justify-between"><span>{c.name} <span className="text-xs text-muted-foreground">· {c.items} item{c.items === 1 ? "" : "s"}</span></span><span className="font-medium tabular-nums">{rupees(c.value)}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.value / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Items</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={view} onValueChange={(v) => setView(v as typeof view)}><SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem><SelectItem value="reorder">To reorder</SelectItem>
                <SelectItem value="A">Class A</SelectItem><SelectItem value="B">Class B</SelectItem><SelectItem value="C">Class C</SelectItem>
                {(Object.keys(MOVEMENT) as Movement[]).map((k) => <SelectItem key={k} value={k}>{MOVEMENT[k].label}</SelectItem>)}
              </SelectContent></Select>
            <div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 w-52 pl-8" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => downloadCsv("stock-analysis.csv", ["SKU", "Item", "Category", "Qty", "Unit", "Min", "Value", "ABC", "Movement", "Monthly use", "Days of cover", "Last issued", "Reorder qty"],
              items.map((i) => [i.sku, i.name, i.category, i.quantity, i.unit, i.minQuantity, i.value, i.abc, MOVEMENT[i.movement].label, i.monthlyUse, i.daysOfCover ?? "", i.lastIssued ?? "", i.reorderQty]))}><Download className="h-4 w-4" /> CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs text-muted-foreground">
              {["Item", "In stock", "Value", "Class", "Movement", "Use / month", "Cover", "Reorder"].map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border/60">
              {items.map((i) => (
                <tr key={i.id} className={cn(i.quantity < i.minQuantity && "bg-red-500/5")}>
                  <td className="px-3 py-2"><p className="font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.sku} · {i.category}{i.lastIssued ? ` · last issued ${fmtDate(i.lastIssued)}` : ""}</p></td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", i.quantity < i.minQuantity && "font-semibold text-red-600")}>{i.quantity} {i.unit}<p className="text-xs font-normal text-muted-foreground">min {i.minQuantity}</p></td>
                  <td className="px-3 py-2 text-right tabular-nums">{rupees(i.value)}</td>
                  <td className="px-3 py-2 text-right"><Badge variant="outline">{i.abc}</Badge></td>
                  <td className="px-3 py-2 text-right"><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", MOVEMENT[i.movement].className)}>{MOVEMENT[i.movement].label}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.monthlyUse || "—"}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", i.daysOfCover != null && i.daysOfCover < 30 && "text-amber-600")}>{i.daysOfCover == null ? "—" : `${i.daysOfCover} d`}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{i.reorderQty ? `${i.reorderQty} ${i.unit}` : "—"}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No items match.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
