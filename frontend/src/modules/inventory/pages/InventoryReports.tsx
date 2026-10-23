import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Download, IndianRupee } from "lucide-react";
import { daysUntil } from "@/lib/dates";
import { downloadCsv, formatINR, inventorySummary, useInventorySettings, useItems, useMovements } from "@/store/inventory";

export function InventoryReports() {
  const items = useItems();
  const settings = useInventorySettings();
  const summary = inventorySummary(items, useMovements(), settings);
  const [period, setPeriod] = useState("30");

  const inPeriod = summary.recent.filter((m) => -daysUntil(m.date) <= Number(period));
  const unitsIn = inPeriod.filter((m) => m.type === "in").reduce((a, m) => a + m.quantity, 0);
  const unitsOut = inPeriod.filter((m) => m.type === "out").reduce((a, m) => a + m.quantity, 0);

  const exportValuation = () => downloadCsv(
    "stock-valuation.csv",
    ["Item", "SKU", "Category", "Quantity", "Unit", "Unit Price (INR)", "Value (INR)", "Location"],
    items.map((i) => [i.name, i.sku, i.category, i.quantity, i.unit, i.unitPrice, i.quantity * i.unitPrice, i.location]),
  );
  const exportMovements = () => downloadCsv(
    `stock-movements-${period}-days.csv`,
    ["Date", "Item", "Type", "Quantity", "Note", "By"],
    inPeriod.map((m) => [m.date, m.itemName, m.type === "in" ? "In" : "Out", m.quantity, m.note, m.by]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Stock valuation, low stock and movement reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={exportValuation}><Download className="h-4 w-4" /> Valuation CSV</Button>
          <Button variant="outline" className="gap-2" onClick={exportMovements}><Download className="h-4 w-4" /> Movements CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5 flex items-center justify-between">
          <div><p className="text-sm text-foreground/60">Stock Value</p><p className="text-2xl font-bold text-foreground mt-1">{formatINR(summary.totalValue)}</p></div>
          <IndianRupee className="h-8 w-8 text-purple-600" />
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center justify-between">
          <div><p className="text-sm text-foreground/60">Units In ({period} days)</p><p className="text-2xl font-bold text-green-600 mt-1">{unitsIn}</p></div>
          <ArrowDownCircle className="h-8 w-8 text-green-600" />
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-center justify-between">
          <div><p className="text-sm text-foreground/60">Units Out ({period} days)</p><p className="text-2xl font-bold text-red-600 mt-1">{unitsOut}</p></div>
          <ArrowUpCircle className="h-8 w-8 text-red-600" />
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Valuation by Category</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {summary.categories.filter((c) => c.items).sort((a, b) => b.value - a.value).map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="text-foreground/60">{formatINR(c.value)}</span>
                </div>
                <Progress value={summary.totalValue ? (c.value / summary.totalValue) * 100 : 0} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-600" /> Reorder List</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {summary.lowStock.length === 0 && <p className="text-sm text-foreground/60">Nothing to reorder.</p>}
            {summary.lowStock.map((i) => (
              <div key={i.id} className="flex items-center justify-between p-3 border border-border rounded-lg text-sm">
                <div>
                  <p className="font-medium text-foreground">{i.name}</p>
                  <p className="text-xs text-foreground/60">{i.quantity} / {i.minQuantity} {i.unit} · reorder {i.minQuantity - i.quantity} {i.unit}</p>
                </div>
                <Badge variant={i.level === "critical" ? "destructive" : "secondary"}>{i.level === "critical" ? "Critical" : "Low"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Stock Movements</CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inPeriod.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{m.date}</TableCell>
                  <TableCell>{m.itemName}</TableCell>
                  <TableCell>
                    <Badge className={m.type === "in" ? "bg-green-600" : "bg-red-600"}>{m.type === "in" ? "In" : "Out"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{m.quantity} {m.unit}</TableCell>
                  <TableCell className="text-foreground/70">{m.note}</TableCell>
                  <TableCell className="text-foreground/70">{m.by}</TableCell>
                </TableRow>
              ))}
              {inPeriod.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-foreground/50 py-6">No movements in this period.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
