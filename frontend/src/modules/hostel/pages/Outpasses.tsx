import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, CornerDownLeft, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { daysFromToday } from "@/lib/dates";
import { requestOutpass, setOutpassStatus, useOutpasses, useResidents, type Outpass } from "@/store/hostel";
import { useStudents } from "@/store/students";

const STYLE: Record<Outpass["status"], string> = {
  Pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Rejected: "bg-red-500/10 text-red-700 dark:text-red-300",
  Returned: "bg-muted text-muted-foreground",
};

export function Outpasses() {
  const passes = useOutpasses();
  const residents = useResidents();
  const { students } = useStudents();
  const [form, setForm] = useState({ studentId: "", from: daysFromToday(1), to: daysFromToday(2), reason: "" });

  const name = (id: number) => students.find((s) => s.id === id);
  const sorted = [...passes].sort((a, b) => (a.status === "Pending" ? -1 : 0) - (b.status === "Pending" ? -1 : 0) || b.requestedOn.localeCompare(a.requestedOn));

  const create = () => {
    if (!form.studentId || !form.reason.trim() || form.to < form.from) { toast.error("Choose a resident, valid dates and a reason"); return; }
    requestOutpass({ studentId: Number(form.studentId), from: form.from, to: form.to, reason: form.reason.trim() });
    toast.success("Outpass request added");
    setForm({ ...form, studentId: "", reason: "" });
  };

  const act = (o: Outpass, status: Outpass["status"]) => {
    setOutpassStatus(o.id, status);
    toast.success(`${name(o.studentId)?.name}: ${status}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Outpasses" description="Leave requests for hostel residents" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">New Outpass</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Resident</Label>
              <Select value={form.studentId} onValueChange={(v) => setForm({ ...form, studentId: v })}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{residents.map((r) => <SelectItem key={r.studentId} value={String(r.studentId)}>{name(r.studentId)?.name} · {name(r.studentId)?.class}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>From</Label><Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div>
              <div className="space-y-2"><Label>To</Label><Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <Button className="w-full" onClick={create}>Add Request</Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {sorted.map((o) => {
            const s = name(o.studentId);
            return (
              <Card key={o.id} className="gap-0">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{s?.name ?? "Former student"}</p>
                      <Badge variant="outline">{s?.class}</Badge>
                      <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${STYLE[o.status]}`}>{o.status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{o.from} → {o.to} · “{o.reason}”</p>
                    <p className="text-xs text-muted-foreground">Parent: {s?.fatherName || "—"} {s?.fatherPhone}</p>
                  </div>
                  <div className="flex gap-2">
                    {o.status === "Pending" && (
                      <>
                        <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => act(o, "Rejected")}><X className="h-4 w-4" /> Reject</Button>
                        <Button size="sm" className="gap-1" onClick={() => act(o, "Approved")}><Check className="h-4 w-4" /> Approve</Button>
                      </>
                    )}
                    {o.status === "Approved" && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => act(o, "Returned")}><CornerDownLeft className="h-4 w-4" /> Mark Returned</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
