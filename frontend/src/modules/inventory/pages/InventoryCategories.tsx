import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box } from "lucide-react";
import { formatINR, inventorySummary, useInventorySettings, useItems, useMovements } from "@/store/inventory";
import { CategoryEditor } from "@/modules/inventory/components/SetupEditors";

export function InventoryCategories() {
  const settings = useInventorySettings();
  const summary = inventorySummary(useItems(), useMovements(), settings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Categories</h1>
        <p className="text-sm text-muted-foreground mt-1">Organise inventory items into categories</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.categories.map((c) => (
          <Card key={c.name}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950"><Box className="h-4 w-4 text-blue-600" /></div>
                <p className="font-semibold text-foreground">{c.name}</p>
              </div>
              <p className="text-2xl font-bold text-foreground">{formatINR(c.value)}</p>
              <p className="text-xs text-foreground/60 mt-1">{c.items} item types · {c.units} units</p>
              {c.low > 0 && <p className="text-xs text-orange-600 mt-1">{c.low} low on stock</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Manage Categories</CardTitle></CardHeader>
        <CardContent><CategoryEditor /></CardContent>
      </Card>
    </div>
  );
}
