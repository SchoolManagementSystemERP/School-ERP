import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { daysFromToday } from "@/lib/dates";
import { LEAVE_TYPES, applyLeave, leaveDays, useLeaves, type LeaveRequest } from "@/store/hr";
import { useCurrentTeacher } from "@/store/session";

/** A teacher applies for leave; HR approves it. */
export function MyLeave() {
  const teacher = useCurrentTeacher();
  const leaves = useLeaves().filter((l) => l.person.kind === "teacher" && l.person.id === teacher?.id);
  const [form, setForm] = useState({ type: "Casual" as LeaveRequest["type"], from: daysFromToday(1), to: daysFromToday(1), reason: "" });

  const taken = (type: LeaveRequest["type"]) => leaves.filter((l) => l.status === "Approved" && l.type === type).reduce((a, l) => a + leaveDays(l), 0);

  const submit = () => {
    if (!teacher) return;
    const error = applyLeave({ person: { kind: "teacher", id: teacher.id, name: teacher.name }, ...form });
    if (error) { toast.error(error); return; }
    toast.success("Leave request sent to HR");
    setForm({ ...form, reason: "" });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Leave" description="Apply for leave and track your requests" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["Casual", "Sick", "Earned", "Unpaid"] as const).map((t) => (
          <Card key={t} className="gap-0"><CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t} leave taken</p>
            <p className="font-display text-2xl font-semibold text-foreground mt-1">{taken(t)} <span className="text-sm font-normal text-muted-foreground">days</span></p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2 h-fit">
          <CardHeader><CardTitle className="text-base">Apply for Leave</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: LeaveRequest["type"]) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>From</Label><Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div>
              <div className="space-y-2"><Label>To</Label><Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Reason</Label><Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <Button className="w-full gap-2" onClick={submit}><Send className="h-4 w-4" /> Send Request</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">My Requests</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {leaves.length === 0 && <p className="text-sm text-muted-foreground">No leave requests yet.</p>}
            {leaves.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{l.type} · {leaveDays(l)} day{leaveDays(l) > 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground">{l.from} → {l.to} · {l.reason}</p>
                </div>
                <Badge variant={l.status === "Rejected" ? "destructive" : l.status === "Approved" ? "default" : "secondary"}>{l.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
