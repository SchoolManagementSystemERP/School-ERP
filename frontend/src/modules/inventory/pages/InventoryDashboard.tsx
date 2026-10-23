import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  Box,
  ArrowRight,
} from "lucide-react";
import { formatINR, inventorySummary, useInventorySettings, useItems, useMovements } from "@/store/inventory";
import { StatCard, toneFrom } from "@/components/common/StatCard";

export function InventoryDashboard() {
  const settings = useInventorySettings();
  const summary = inventorySummary(useItems(), useMovements(), settings);

  const stats = [
    { title: "Total Items", value: summary.totalUnits.toLocaleString("en-IN"), icon: Package, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950" },
    { title: "Categories", value: String(summary.categoryCount), icon: Box, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950" },
    { title: "Low Stock Items", value: String(summary.lowStock.length), icon: AlertTriangle, color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950" },
    { title: "Total Value", value: formatINR(summary.totalValue), icon: TrendingUp, color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950" },
  ];

  const categoryStats = summary.categories.filter((c) => c.items > 0).sort((a, b) => b.value - a.value);
  const lowStockItems = settings.lowStockAlerts
    ? summary.lowStock.map((i) => ({ name: i.name, category: i.category, current: i.quantity, minimum: i.minQuantity, level: i.level }))
    : [];
  const recentActivity = summary.recent.slice(0, 6).map((m) => ({
    action: m.type === "in" ? "Added" : "Removed",
    item: `${m.itemName} (${m.quantity} ${m.unit})`,
    category: `${m.category} · ${m.note}`,
    user: m.by,
    date: m.date,
  }));

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      Added: "bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-300",
      Allocated: "bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300",
      Updated: "bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-300",
      Removed: "bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300",
    };
    return (
      <Badge variant="secondary" className={colors[action] || ""}>
        {action}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Inventory Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of school inventory and assets</p>
        </div>
        <Link to="/inventory/items">
          <Button className="gap-2">
            View All Items
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} label={stat.title} value={stat.value} icon={stat.icon} tone={toneFrom(stat.color)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Inventory by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryStats.map((category, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">{category.name}</span>
                    <span className="text-sm text-foreground/60">{category.units} units · {formatINR(category.value)}</span>
                  </div>
                  <Progress value={summary.totalValue ? (category.value / summary.totalValue) * 100 : 0} className="h-2 mb-1" />
                  <div className="flex items-center justify-between text-xs text-foreground/60">
                    <span>{category.items} item types</span>
                    <span className={category.low ? "text-orange-600" : ""}>{category.low} low on stock</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className="border-orange-200 dark:border-orange-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-300">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockItems.length === 0 && <p className="text-sm text-foreground/60">{settings.lowStockAlerts ? "All items are above their minimum stock." : "Low-stock alerts are turned off in Setup."}</p>}
              {lowStockItems.map((item, index) => (
                <div
                  key={index}
                  className="p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                    </div>
                    <Badge variant="destructive">{item.level === "critical" ? "Critical" : "Low"}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-orange-900 dark:text-orange-300">
                      Current: <strong>{item.current}</strong>
                    </span>
                    <span className="text-orange-900 dark:text-orange-300">
                      Required: <strong>{item.minimum}</strong>
                    </span>
                  </div>
                  <Progress
                    value={(item.current / item.minimum) * 100}
                    className="h-1.5 mt-2"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border border-border rounded-lg"
              >
                <div className="flex items-center gap-4 flex-1">
                  {getActionBadge(activity.action)}
                  <div>
                    <p className="font-medium text-foreground">{activity.item}</p>
                    <p className="text-sm text-muted-foreground">{activity.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-foreground">{activity.user}</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.date}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
