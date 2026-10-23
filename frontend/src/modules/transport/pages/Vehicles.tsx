import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { useRoutes, useVehicles, vehicleStore, type Vehicle } from "@/store/transport";
import { expiryBadge } from "./TransportDashboard";

const empty = { number: "", type: "Bus" as Vehicle["type"], capacity: "40", driverName: "", driverPhone: "", insuranceExpiry: "", fitnessExpiry: "" };

export function Vehicles() {
  const vehicles = useVehicles();
  const routes = useRoutes();
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [form, setForm] = useState(empty);

  const open = (v: Vehicle | "new") => {
    setEditing(v);
    setForm(v === "new" ? empty : { ...v, capacity: String(v.capacity) });
  };

  const save = () => {
    const capacity = Number(form.capacity);
    if (!form.number.trim() || !form.driverName.trim() || !capacity || !form.insuranceExpiry || !form.fitnessExpiry) {
      toast.error("Number, driver, capacity and both expiry dates are required");
      return;
    }
    const record = { ...form, number: form.number.trim().toUpperCase(), driverName: form.driverName.trim(), capacity };
    if (editing === "new") vehicleStore.add(record);
    else if (editing) vehicleStore.update({ ...editing, ...record });
    toast.success("Vehicle saved");
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Vehicles" description="Buses, drivers and document validity" actions={<Button className="gap-2" onClick={() => open("new")}><Plus className="h-4 w-4" /> Add Vehicle</Button>} />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Insurance</TableHead>
                <TableHead>Fitness</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <p className="font-medium font-mono">{v.number}</p>
                    <p className="text-xs text-muted-foreground">{v.type} · {v.capacity} seats</p>
                  </TableCell>
                  <TableCell>{routes.filter((r) => r.vehicleId === v.id).map((r) => r.name).join(", ") || "—"}</TableCell>
                  <TableCell>
                    <p>{v.driverName}</p>
                    <p className="text-xs text-muted-foreground">{v.driverPhone}</p>
                  </TableCell>
                  <TableCell><div className="flex flex-col gap-1 items-start">{expiryBadge(v.insuranceExpiry)}<span className="text-xs text-muted-foreground">{v.insuranceExpiry}</span></div></TableCell>
                  <TableCell><div className="flex flex-col gap-1 items-start">{expiryBadge(v.fitnessExpiry)}<span className="text-xs text-muted-foreground">{v.fitnessExpiry}</span></div></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => open(v)} aria-label="Edit vehicle"><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add Vehicle" : "Edit Vehicle"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>Registration no.</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="UP32 AB 1234" /></div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: Vehicle["type"]) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(["Bus", "Mini Bus", "Van"] as const).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Capacity</Label><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
            <div className="space-y-2"><Label>Driver</Label><Input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} /></div>
            <div className="space-y-2"><Label>Driver phone</Label><Input value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Insurance expiry</Label><Input type="date" value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} /></div>
            <div className="space-y-2"><Label>Fitness expiry</Label><Input type="date" value={form.fitnessExpiry} onChange={(e) => setForm({ ...form, fitnessExpiry: e.target.value })} /></div>
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
