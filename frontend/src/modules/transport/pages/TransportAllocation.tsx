import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { useClassRoster, useStudents } from "@/store/students";
import { useRoutes, useVehicles } from "@/store/transport";
import type { Student } from "@/types/student";

/** Assign students to a route and stop (stored on the student's profile). */
export function TransportAllocation() {
  const { students, updateStudent } = useStudents();
  const { classes } = useClassRoster();
  const routes = useRoutes();
  const vehicles = useVehicles();
  const [search, setSearch] = useState("");
  const [cls, setCls] = useState("all");
  const [filter, setFilter] = useState("all");

  const q = search.toLowerCase();
  const matchesFilter = (s: Student) => {
    if (filter === "all") return true;
    if (filter === "using") return s.needsTransport;
    if (filter === "not") return !s.needsTransport;
    return s.needsTransport && s.busRoute === filter; // a route name
  };
  const shown = students.filter((s) =>
    (cls === "all" || s.class === cls) && matchesFilter(s) && (!q || s.name.toLowerCase().includes(q) || s.rollNo.includes(q)),
  );

  const seatsLeft = (routeName: string) => {
    const r = routes.find((x) => x.name === routeName);
    const v = vehicles.find((x) => x.id === r?.vehicleId);
    if (!v) return Infinity;
    return v.capacity - students.filter((s) => s.needsTransport && s.busRoute === routeName).length;
  };

  const assign = (s: Student, routeName: string) => {
    if (s.busRoute !== routeName && seatsLeft(routeName) <= 0) { toast.error(`${routeName} is full`); return; }
    const route = routes.find((r) => r.name === routeName);
    updateStudent({ ...s, needsTransport: true, busRoute: routeName, busStop: route?.stops[0] ?? "" });
    toast.success(`${s.name} → ${routeName}`);
  };

  const setStop = (s: Student, stop: string) => updateStudent({ ...s, busStop: stop });

  const unassign = (s: Student) => {
    updateStudent({ ...s, needsTransport: false, busRoute: "", busStop: "" });
    toast.success(`${s.name} removed from transport`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Student Allocation" description="Choose a route and pickup stop for each student" />

      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name or roll number..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="using">Using transport</SelectItem>
              <SelectItem value="not">Not using transport</SelectItem>
              {routes.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {shown.map((s) => {
            const route = routes.find((r) => r.name === s.busRoute);
            return (
              <div key={s.id} className="flex flex-col md:flex-row md:items-center gap-3 p-4">
                <div className="md:w-64 shrink-0">
                  <p className="text-sm font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.class} · Roll {s.rollNo}</p>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Select value={s.needsTransport && s.busRoute ? s.busRoute : ""} onValueChange={(v) => assign(s, v)}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="No transport" /></SelectTrigger>
                    <SelectContent>
                      {routes.map((r) => <SelectItem key={r.id} value={r.name}>{r.name} ({Math.max(0, seatsLeft(r.name) === Infinity ? 99 : seatsLeft(r.name))} left)</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {s.needsTransport && route && (
                    <Select value={s.busStop || route.stops[0]} onValueChange={(v) => setStop(s, v)}>
                      <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>{route.stops.filter((x) => x !== "School").map((stop) => <SelectItem key={stop} value={stop}>{stop}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {s.needsTransport && (
                    <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => unassign(s)}><X className="h-4 w-4" /> Remove</Button>
                  )}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No students found.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
