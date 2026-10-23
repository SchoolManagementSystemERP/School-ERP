import { useState } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Phone, Plus, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { today } from "@/lib/dates";
import { inr } from "@/store/finance";
import { onLeaveToday, staffStore, teacherPayslip, useLeaves, useStaff } from "@/store/hr";
import { useTeachers } from "@/store/teachers";

const emptyStaff = { name: "", designation: "", department: "", phone: "", email: "", salary: "", joiningDate: today() };

/** Teaching and non-teaching staff in one directory. */
export function StaffDirectory() {
  const { teachers } = useTeachers();
  const staff = useStaff();
  const leaves = useLeaves();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyStaff);

  const people = [
    ...teachers.map((t) => ({
      key: `t${t.id}`, kind: "Teaching", empId: t.empId, name: t.name, designation: t.designation, department: t.department,
      phone: t.phone, email: t.email, salary: teacherPayslip(t).gross, status: onLeaveToday(leaves, "teacher", t.id) ? "On Leave" : t.status,
    })),
    ...staff.map((s) => ({
      key: `s${s.id}`, kind: "Non-teaching", empId: s.empId, name: s.name, designation: s.designation, department: s.department,
      phone: s.phone, email: s.email, salary: s.salary, status: onLeaveToday(leaves, "staff", s.id) ? "On Leave" : s.status,
    })),
  ];
  const q = search.toLowerCase();
  const shown = people.filter((p) =>
    (kind === "all" || p.kind === kind) &&
    (!q || [p.name, p.empId, p.designation, p.department].some((v) => v.toLowerCase().includes(q))),
  );

  const save = () => {
    const salary = Number(form.salary);
    if (!form.name.trim() || !form.designation.trim() || !form.department.trim() || !salary) {
      toast.error("Name, designation, department and salary are required");
      return;
    }
    const next = staffStore.getAll().reduce((m, s) => Math.max(m, Number(s.empId.slice(1)) || 0), 0) + 1;
    staffStore.add({
      empId: `S${String(next).padStart(3, "0")}`, name: form.name.trim(), designation: form.designation.trim(), department: form.department.trim(),
      phone: form.phone.trim(), email: form.email.trim(), salary, joiningDate: form.joiningDate, status: "Active",
    });
    toast.success(`${form.name} added to staff`);
    setOpen(false);
    setForm(emptyStaff);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Directory"
        description={`${people.length} people · teachers are added from Teacher Setup`}
        actions={
          <>
            <Button variant="outline" className="gap-2" asChild><Link to="/hr/setup/teachers"><UserPlus className="h-4 w-4" /> Add Teacher</Link></Button>
            <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Staff</Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, ID, designation, department..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              <SelectItem value="Teaching">Teaching</SelectItem>
              <SelectItem value="Non-teaching">Non-teaching</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map((p) => (
          <Card key={p.key} className="gap-0">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-semibold shrink-0">
                  {p.name.replace(/^(Mr|Mrs|Ms|Dr)\.\s*/, "").split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.designation} · {p.department}</p>
                </div>
                <Badge variant={p.status === "Active" ? "secondary" : "outline"} className={p.status === "On Leave" ? "text-amber-600" : ""}>{p.status}</Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="font-mono">{p.empId}</Badge>
                <Badge variant="outline">{p.kind}</Badge>
                <Badge variant="outline">{inr(p.salary)}/mo</Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {p.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{p.phone}</p>}
                {p.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{p.email}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Non-teaching Staff</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {([
              ["name", "Full name", "text"], ["designation", "Designation", "text"], ["department", "Department", "text"],
              ["salary", "Monthly salary (₹)", "number"], ["phone", "Phone", "text"], ["email", "Email", "email"], ["joiningDate", "Joining date", "date"],
            ] as const).map(([key, label, type]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Add</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
