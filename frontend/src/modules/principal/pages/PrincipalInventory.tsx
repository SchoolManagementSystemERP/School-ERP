import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Boxes, IndianRupee, Package, Settings, TrendingUp } from "lucide-react";
import { formatINR, inventorySummary, useInventorySettings, useItems, useMovements } from "@/store/inventory";
import { useSectionBase } from "@/lib/section";

export function PrincipalInventory() {
  const base = useSectionBase();
  const s = inventorySummary(useItems(), useMovements(), useInventorySettings());

  const stats = [
    { label: "Stock Value", value: formatINR(s.totalValue), icon: IndianRupee, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
    { label: "Item Types", value: s.totalItems, icon: Package, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Units in Stock", value: s.totalUnits.toLocaleString("en-IN"), icon: Boxes, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
    { label: "Need Reorder", value: s.lowStock.length, icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage school inventory and assets</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to={`${base}/setup/inventory`}><Settings className="h-4 w-4" /> Inventory Setup</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((st) => (
          <Card key={st.label}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg ${st.bg} flex items-center justify-center mb-3`}>
                <st.icon className={`h-5 w-5 ${st.color}`} />
              </div>
              <p className={`text-2xl font-bold ${st.color}`}>{st.value}</p>
              <p className="text-xs text-foreground/60 mt-0.5">{st.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-600" /> Items to Reorder</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.lowStock.length === 0 && <p className="text-sm text-foreground/60">All items are above their minimum stock.</p>}
            {s.lowStock.map((i) => (
              <div key={i.id} className="p-3 border border-border rounded-lg">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{i.name}</p>
                    <p className="text-xs text-foreground/60">{i.category} · {i.location}</p>
                  </div>
                  <Badge variant={i.level === "critical" ? "destructive" : "secondary"}>{i.quantity}/{i.minQuantity} {i.unit}</Badge>
                </div>
                <Progress value={(i.quantity / i.minQuantity) * 100} className="h-1.5 mt-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-600" /> Value by Category</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {s.categories.filter((c) => c.items).sort((a, b) => b.value - a.value).map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="text-foreground/60">{formatINR(c.value)}</span>
                </div>
                <Progress value={s.totalValue ? (c.value / s.totalValue) * 100 : 0} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Stock Movements</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {s.recent.slice(0, 8).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 p-3 border border-border rounded-lg text-sm">
              <div className="flex items-center gap-3 min-w-0">
                <Badge className={m.type === "in" ? "bg-green-600" : "bg-red-600"}>{m.type === "in" ? "In" : "Out"}</Badge>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{m.itemName} · {m.quantity} {m.unit}</p>
                  <p className="text-xs text-foreground/60">{m.note}</p>
                </div>
              </div>
              <p className="text-xs text-foreground/60 shrink-0">{m.by} · {m.date}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
