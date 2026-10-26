import { Link } from "react-router";
import { AlertTriangle, ArrowRight, Boxes, ClipboardList, IndianRupee, PackageCheck, PackageX, RefreshCcw, ShoppingCart, Truck } from "lucide-react";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import { today } from "@/lib/dates";
import { useApi } from "@/lib/useApi";
import { inventorySummary, useInventorySettings, useItems, useMovements } from "@/store/inventory";
import { inr, poTotal, useIndents, usePurchaseOrders, useVendors } from "@/store/procurement";
import { IndentStatusBadge } from "@/modules/procurement/components";
import { ProcessRail, useRailSteps } from "@/modules/procurement/flow";
import { StockFlowChart, ValueBars } from "../charts";

interface Analysis {
  totals: { items: number; stockValue: number; consumptionValue: number; lowStock: number; toReorder: number; deadStockValue: number };
  categories: { name: string; items: number; value: number }[];
  consumption: { month: string; issued: number; received: number }[];
}


/** The store's control room: stock health, money flow, the purchase pipeline and what needs doing today. */
export function InventoryDashboard() {
  const { data } = useApi<Analysis>("/inventory/analysis?months=6");
  const settings = useInventorySettings();
  const summary = inventorySummary(useItems(), useMovements(), settings);
  const indents = useIndents();
  const orders = usePurchaseOrders();
  const vendors = useVendors();
  const rail = useRailSteps();

  const t = data?.totals;
  const live = orders.filter((p) => p.status !== "CANCELLED");
  const openPos = live.filter((p) => p.status === "SENT" || p.status === "PARTIALLY_RECEIVED");
  const overdue = openPos.filter((p) => p.deliveryBy < today());
  const todo = indents.filter((i) => ["PENDING_STORE", "APPROVED_FOR_PURCHASE", "GOODS_RECEIVED"].includes(i.status)).slice(0, 6);
  const spend = vendors.map((v) => ({ name: v.name.length > 22 ? `${v.name.slice(0, 21)}…` : v.name, value: Math.round(live.filter((p) => p.vendorId === v.id).reduce((s, p) => s + poTotal(p), 0)) }))
    .filter((v) => v.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  const categories = (data?.categories ?? []).filter((c) => c.value > 0).slice(0, 7).map((c) => ({ name: c.name, value: c.value }));

  return (
    <div className="space-y-6">
      <PageHeader title="Store & Inventory" description="Stock health, purchases and the procurement pipeline at a glance."
        actions={
          <>
            <Button variant="outline" className="gap-2" asChild><Link to="/inventory/requisitions?new=reorder"><RefreshCcw className="h-4 w-4" /> Reorder low stock</Link></Button>
            <Button className="gap-2" asChild><Link to="/inventory/requisitions"><ClipboardList className="h-4 w-4" /> Requisitions</Link></Button>
          </>
        } />

      <MiniStats items={[
        { label: `Stock value · ${summary.totalUnits.toLocaleString("en-IN")} units`, value: inr(t?.stockValue ?? summary.totalValue), icon: IndianRupee, tone: "blue" },
        { label: "Below minimum", value: summary.lowStock.length, icon: AlertTriangle, tone: "amber" },
        { label: `Open POs · ${overdue.length} overdue`, value: openPos.length, icon: Truck, tone: overdue.length ? "red" : "violet" },
        { label: "Dead stock (90+ days)", value: inr(t?.deadStockValue ?? 0), icon: PackageX, tone: "slate" },
      ]} />

      <ProcessRail steps={rail} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="gap-0 xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Stock in vs stock out — last 6 months</CardTitle>
            <Link to="/inventory/analysis" className="text-sm text-primary hover:underline">Full analysis</Link>
          </CardHeader>
          <CardContent><StockFlowChart data={data?.consumption ?? []} /></CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-500" /> Low stock</CardTitle>
            {summary.lowStock.length > 0 && <Link to="/inventory/requisitions?new=reorder" className="text-sm text-primary hover:underline">Reorder all</Link>}
          </CardHeader>
          <CardContent className="space-y-2.5">
            {summary.lowStock.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Every item is above its minimum.</p>}
            {summary.lowStock.slice(0, 6).map((i) => {
              const pct = i.minQuantity ? Math.min(100, (i.quantity / i.minQuantity) * 100) : 0;
              return (
                <div key={i.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-foreground">{i.name}</span>
                    <span className={cn("shrink-0 text-xs tabular-nums", i.level === "critical" ? "font-semibold text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300")}>{i.quantity} / {i.minQuantity} {i.unit}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", i.level === "critical" ? "bg-red-500" : "bg-amber-500")} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="gap-0">
          <CardHeader className="pb-2"><CardTitle className="text-base">Stock value by category</CardTitle></CardHeader>
          <CardContent><ValueBars data={categories} /></CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Top vendors by order value</CardTitle>
            <Link to="/inventory/vendors" className="text-sm text-primary hover:underline">Vendor master</Link>
          </CardHeader>
          <CardContent>
            {spend.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No purchase orders yet.</p> : <ValueBars data={spend} labelWidth={150} />}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="gap-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Needs your action</CardTitle>
            <Link to="/inventory/requisitions" className="text-sm text-primary hover:underline">All PRs</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {todo.length === 0 && overdue.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">All caught up.</p>}
            {overdue.map((p) => (
              <Link key={p.id} to="/inventory/purchase-orders" className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm hover:bg-red-500/10">
                <Truck className="h-4 w-4 shrink-0 text-red-600" />
                <span className="min-w-0 flex-1"><span className="font-mono text-xs">{p.no}</span> <span className="text-muted-foreground">overdue since {p.deliveryBy} · {vendors.find((v) => v.id === p.vendorId)?.name}</span></span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
            {todo.map((i) => (
              <Link key={i.id} to="/inventory/requisitions" className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent">
                {i.status === "GOODS_RECEIVED" ? <PackageCheck className="h-4 w-4 shrink-0 text-teal-600" /> : i.status === "APPROVED_FOR_PURCHASE" ? <ShoppingCart className="h-4 w-4 shrink-0 text-violet-600" /> : <Boxes className="h-4 w-4 shrink-0 text-sky-600" />}
                <span className="min-w-0 flex-1 truncate"><span className="font-mono text-xs">{i.no}</span> <span className="text-muted-foreground">{i.lines.map((l) => l.name).join(", ")}</span></span>
                <IndentStatusBadge status={i.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent stock movements</CardTitle>
            <Link to="/inventory/items" className="text-sm text-primary hover:underline">All items</Link>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {summary.recent.slice(0, 7).map((m, n) => (
              <div key={n} className="flex items-center gap-3 py-2.5 text-sm">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold", m.type === "in" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-orange-500/10 text-orange-700 dark:text-orange-300")}>{m.type === "in" ? "IN" : "OUT"}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-foreground">{m.itemName} · {m.quantity} {m.unit}</span><span className="block truncate text-xs text-muted-foreground">{m.note}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{m.date}</span>
              </div>
            ))}
            {summary.recent.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No movements yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
