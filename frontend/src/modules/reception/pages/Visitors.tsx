import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { today } from "@/lib/dates";
import { VISIT_PURPOSES, checkInVisitor, checkOutVisitor, useVisitors } from "@/store/frontOffice";
import { useTeachers } from "@/store/teachers";

const empty = { name: "", phone: "", purpose: "", toMeet: "", people: "1" };

export function Visitors() {
  const visitors = useVisitors();
  const { teachers } = useTeachers();
  const [form, setForm] = useState(empty);
  const [day, setDay] = useState(today());
  const hosts = ["Principal", "Vice Principal", "Front Office", "Accounts", "Office", ...teachers.map((t) => t.name)];

  const shown = visitors.filter((v) => v.date === day);

  const checkIn = () => {
    if (!form.name.trim() || !form.purpose || !form.toMeet) {
      toast.error("Name, purpose and whom to meet are required");
      return;
    }
    checkInVisitor({ name: form.name.trim(), phone: form.phone.trim(), purpose: form.purpose, toMeet: form.toMeet, people: Math.max(1, Number(form.people) || 1) });
    toast.success(`${form.name} checked in`);
    setForm(empty);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Visitor Log" description="Check visitors in and out at the gate" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><LogIn className="h-4 w-4 text-primary" /> Check In</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Visitor name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v })}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{VISIT_PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To meet</Label>
              <Select value={form.toMeet} onValueChange={(v) => setForm({ ...form, toMeet: v })}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{hosts.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>People</Label><Input type="number" min={1} value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} /></div>
            <Button className="w-full gap-2" onClick={checkIn}><LogIn className="h-4 w-4" /> Check In</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
            <CardTitle className="text-base">Visitors · {shown.length}</CardTitle>
            <Input type="date" className="w-44 h-8" value={day} onChange={(e) => setDay(e.target.value || today())} />
          </CardHeader>
          <CardContent className="space-y-2">
            {shown.length === 0 && <p className="text-sm text-muted-foreground">No visitors on this day.</p>}
            {shown.map((v) => (
              <div key={v.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium text-foreground">{v.name} {v.people > 1 && <span className="text-muted-foreground font-normal">+{v.people - 1}</span>}</p>
                  <p className="text-xs text-muted-foreground">{v.purpose} · meeting {v.toMeet}{v.phone ? ` · ${v.phone}` : ""}</p>
                </div>
                <Badge variant="outline">In {v.inTime}</Badge>
                {v.outTime ? (
                  <Badge variant="secondary">Out {v.outTime}</Badge>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => { checkOutVisitor(v.id); toast.success(`${v.name} checked out`); }}>
                    <LogOut className="h-4 w-4" /> Check Out
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
