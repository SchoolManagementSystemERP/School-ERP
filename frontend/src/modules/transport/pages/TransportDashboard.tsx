import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Bus, MapPin, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { daysUntil } from "@/lib/dates";
import { useStudents } from "@/store/students";
import { useRoutes, useVehicles } from "@/store/transport";

export const expiryBadge = (date: string) => {
  const d = daysUntil(date);
  if (d < 0) return <Badge variant="destructive">Expired</Badge>;
  if (d <= 30) return <Badge variant="outline" className="text-amber-600">{d} days left</Badge>;
  return <Badge variant="secondary">Valid</Badge>;
};

export function TransportDashboard() {
  const routes = useRoutes();
  const vehicles = useVehicles();
  const { students } = useStudents();
  const riders = students.filter((s) => s.needsTransport && s.busRoute);

  const expiring = vehicles.flatMap((v) => [
    { v, doc: "Insurance", date: v.insuranceExpiry },
    { v, doc: "Fitness certificate", date: v.fitnessExpiry },
  ]).filter((x) => daysUntil(x.date) <= 30).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <PageHeader title="Transport" description="Routes, vehicles and students using school transport" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Vehicles" value={vehicles.length} icon={Bus} tone="indigo" hint={`${vehicles.reduce((a, v) => a + v.capacity, 0)} seats`} href="/transport/vehicles" />
        <StatCard label="Routes" value={routes.length} icon={MapPin} tone="blue" href="/transport/routes" />
        <StatCard label="Students using transport" value={riders.length} icon={Users} tone="green" href="/transport/allocation" />
        <StatCard label="Documents due" value={expiring.length} icon={AlertTriangle} tone="amber" hint="insurance / fitness within 30 days" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Route Occupancy</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {routes.map((r) => {
              const v = vehicles.find((x) => x.id === r.vehicleId);
              const count = riders.filter((s) => s.busRoute === r.name).length;
              return (
                <div key={r.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-foreground">{r.name} <span className="text-muted-foreground font-normal">· {v?.number ?? "No vehicle"}</span></span>
                    <span className="text-muted-foreground">{count}/{v?.capacity ?? 0}</span>
                  </div>
                  <Progress value={v ? (count / v.capacity) * 100 : 0} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Documents Expiring Soon</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {expiring.length === 0 && <p className="text-sm text-muted-foreground">All vehicle documents are valid for the next 30 days.</p>}
            {expiring.map((x) => (
              <div key={`${x.v.id}-${x.doc}`} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{x.v.number} · {x.doc}</p>
                  <p className="text-xs text-muted-foreground">Expires {x.date} · driver {x.v.driverName}</p>
                </div>
                {expiryBadge(x.date)}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
