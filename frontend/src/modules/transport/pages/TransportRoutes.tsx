import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { inr } from "@/store/finance";
import { useStudents } from "@/store/students";
import { routeStore, useRoutes, useVehicles, type BusRoute } from "@/store/transport";

const empty = { name: "", stops: "", vehicleId: "none", monthlyFee: "", pickupTime: "07:00" };

export function TransportRoutes() {
  const routes = useRoutes();
  const vehicles = useVehicles();
  const { students } = useStudents();
  const [editing, setEditing] = useState<BusRoute | "new" | null>(null);
  const [form, setForm] = useState(empty);

  const open = (r: BusRoute | "new") => {
    setEditing(r);
    setForm(r === "new" ? empty : { name: r.name, stops: r.stops.join(", "), vehicleId: r.vehicleId ? String(r.vehicleId) : "none", monthlyFee: String(r.monthlyFee), pickupTime: r.pickupTime });
  };

  const save = () => {
    const stops = form.stops.split(",").map((s) => s.trim()).filter(Boolean);
    const fee = Number(form.monthlyFee);
    if (!form.name.trim() || stops.length < 2 || !fee) { toast.error("Name, at least two stops and a monthly fee are required"); return; }
    const record = { name: form.name.trim(), stops, vehicleId: form.vehicleId === "none" ? null : Number(form.vehicleId), monthlyFee: fee, pickupTime: form.pickupTime };
    if (editing === "new") routeStore.add(record);
    else if (editing) routeStore.update({ ...editing, ...record });
    toast.success("Route saved");
    setEditing(null);
  };

  const remove = (r: BusRoute) => {
    const riders = students.filter((s) => s.needsTransport && s.busRoute === r.name).length;
    if (riders) { toast.error(`${riders} students use ${r.name} — move them first`); return; }
    routeStore.remove(r.id);
    toast.success(`${r.name} deleted`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Routes" description="Bus routes, stops and fees" actions={<Button className="gap-2" onClick={() => open("new")}><Plus className="h-4 w-4" /> Add Route</Button>} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {routes.map((r) => {
          const v = vehicles.find((x) => x.id === r.vehicleId);
          const riders = students.filter((s) => s.needsTransport && s.busRoute === r.name).length;
          return (
            <Card key={r.id} className="gap-0">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-semibold text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> First pickup {r.pickupTime} · {inr(r.monthlyFee)}/month</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => open(r)} aria-label="Edit route"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => remove(r)} aria-label="Delete route"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <ol className="relative border-l border-border ml-2 space-y-2">
                  {r.stops.map((stop) => (
                    <li key={stop} className="ml-4 text-sm text-foreground">
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                      {stop}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{v ? `${v.number} · ${v.driverName}` : "No vehicle assigned"}</Badge>
                  <Badge variant="outline">{riders}{v ? `/${v.capacity}` : ""} students</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add Route" : "Edit Route"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Route name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Route 9D" /></div>
              <div className="space-y-2"><Label>First pickup</Label><Input type="time" value={form.pickupTime} onChange={(e) => setForm({ ...form, pickupTime: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Stops (comma separated, in order)</Label><Input value={form.stops} onChange={(e) => setForm({ ...form, stops: e.target.value })} placeholder="Gomti Nagar, Patrakarpuram, School" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Select value={form.vehicleId} onValueChange={(v) => setForm({ ...form, vehicleId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {vehicles.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.number} ({v.capacity})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Monthly fee (₹)</Label><Input type="number" min={0} value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Renaming a route does not move students already on it.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
