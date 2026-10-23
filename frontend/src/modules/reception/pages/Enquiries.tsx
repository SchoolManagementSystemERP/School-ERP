import { useState } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { ENQUIRY_SOURCES, ENQUIRY_STATUSES, addEnquiry, updateEnquiry, useEnquiries, type EnquiryStatus } from "@/store/frontOffice";

const STATUS_STYLE: Record<EnquiryStatus, string> = {
  New: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  Contacted: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "Visit Scheduled": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Admitted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Closed: "bg-muted text-muted-foreground",
};

const empty = { studentName: "", parentName: "", phone: "", email: "", grade: "", source: "Walk-in", notes: "", followUp: "" };

export function Enquiries() {
  const enquiries = useEnquiries();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");

  const q = search.toLowerCase();
  const shown = enquiries.filter((e) =>
    (status === "all" || (status === "open" ? e.status !== "Admitted" && e.status !== "Closed" : e.status === status)) &&
    (!q || [e.studentName, e.parentName, e.phone].some((v) => v.toLowerCase().includes(q))),
  );

  const save = () => {
    if (!form.studentName.trim() || !form.parentName.trim() || !/^[+\d][\d\s-]{7,}$/.test(form.phone.trim()) || !form.grade) {
      toast.error("Student name, parent name, a valid phone and class are required");
      return;
    }
    addEnquiry({ ...form, studentName: form.studentName.trim(), parentName: form.parentName.trim(), phone: form.phone.trim(), followUp: form.followUp || undefined });
    toast.success("Enquiry recorded");
    setOpen(false);
    setForm(empty);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admission Enquiries"
        description="Track prospective students from first call to admission"
        actions={
          <>
            <Button variant="outline" asChild><Link to="/reception/admission">New Admission</Link></Button>
            <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Enquiry</Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search student, parent or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="all">All</SelectItem>
              {ENQUIRY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {shown.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No enquiries.</CardContent></Card>}
        {shown.map((e) => (
          <Card key={e.id} className="gap-0">
            <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{e.studentName}</p>
                  <Badge variant="outline">{/^d+$/.test(e.grade) ? `Class ${e.grade}` : e.grade}</Badge>
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${STATUS_STYLE[e.status]}`}>{e.status}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                  <span>{e.parentName}</span>
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</span>
                  <span>{e.source} · {e.date}</span>
                  {e.followUp && <span className="text-amber-600">Follow up {e.followUp}</span>}
                </p>
                {e.notes && <p className="text-xs text-muted-foreground mt-1">“{e.notes}”</p>}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Input type="date" className="h-8 w-40" value={e.followUp ?? ""} onChange={(ev) => updateEnquiry(e.id, { followUp: ev.target.value || undefined })} aria-label="Follow-up date" />
                <Select value={e.status} onValueChange={(v: EnquiryStatus) => { updateEnquiry(e.id, { status: v }); toast.success(`${e.studentName}: ${v}`); }}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>{ENQUIRY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Enquiry</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>Student name</Label><Input value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} /></div>
            <div className="space-y-2"><Label>Parent name</Label><Input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765-43210" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Class sought</Label>
              <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{["8", "9", "10", "11", "12"].map((g) => <SelectItem key={g} value={g}>Class {g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENQUIRY_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Follow-up date</Label><Input type="date" value={form.followUp} onChange={(e) => setForm({ ...form, followUp: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
