import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, HeartHandshake, Mail, Pencil, Phone, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { useClassRoster, useStudents } from "@/store/students";
import type { Student } from "@/types/student";

const PARENT_FIELDS = [
  ["fatherName", "Father's Name"], ["fatherPhone", "Father's Phone"], ["fatherEmail", "Father's Email"], ["fatherOccupation", "Father's Occupation"],
  ["motherName", "Mother's Name"], ["motherPhone", "Mother's Phone"], ["motherEmail", "Mother's Email"], ["motherOccupation", "Mother's Occupation"],
] as const;

type ParentForm = Record<(typeof PARENT_FIELDS)[number][0], string>;

/** Father / mother contact of a student. */
const parentsOf = (s: Student) => [
  { label: "Father", name: s.fatherName, phone: s.fatherPhone, email: s.fatherEmail },
  { label: "Mother", name: s.motherName, phone: s.motherPhone, email: s.motherEmail },
];

const hasContact = (s: Student) => !!(s.fatherName && (s.fatherPhone || s.fatherEmail)) || !!(s.motherName && (s.motherPhone || s.motherEmail));

/** Parent / guardian records, stored on each student's profile. */
export function PrincipalParentSetup() {
  const { students, updateStudent } = useStudents();
  const { classes } = useClassRoster();
  const [search, setSearch] = useState("");
  const [cls, setCls] = useState("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<ParentForm | null>(null);

  const q = search.toLowerCase();
  const rows = students.filter((s) => {
    const matchSearch = !q || [s.name, s.fatherName, s.motherName, s.fatherPhone, s.motherPhone, s.rollNo].some((v) => v.toLowerCase().includes(q));
    return matchSearch && (cls === "all" || s.class === cls) && (!onlyMissing || !hasContact(s));
  });
  const missing = students.filter((s) => !hasContact(s)).length;

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm(Object.fromEntries(PARENT_FIELDS.map(([k]) => [k, s[k]])) as ParentForm);
  };

  const save = () => {
    if (!editing || !form) return;
    if (!form.fatherName.trim() && !form.motherName.trim()) {
      toast.error("Add at least one parent's name");
      return;
    }
    const phoneOk = (p: string) => !p || /^[+\d][\d\s-]{7,}$/.test(p.trim());
    if (!phoneOk(form.fatherPhone) || !phoneOk(form.motherPhone)) {
      toast.error("Phone numbers should contain digits only (with optional +, spaces or -)");
      return;
    }
    const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as ParentForm;
    updateStudent({ ...editing, ...trimmed });
    toast.success(`Parent details saved for ${editing.name}`);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Parent Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">Parent and guardian contacts linked to each student</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-900/20"><Users className="h-5 w-5 text-violet-600" /></div>
          <div><p className="text-2xl font-bold text-foreground">{students.length}</p><p className="text-xs text-foreground/60">Students</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20"><HeartHandshake className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-2xl font-bold text-foreground">{students.length - missing}</p><p className="text-xs text-foreground/60">With parent contact</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20"><AlertTriangle className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-2xl font-bold text-foreground">{missing}</p><p className="text-xs text-foreground/60">Missing parent contact</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Parents & Guardians</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <Input className="pl-9" placeholder="Search student, parent or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={cls} onValueChange={setCls}>
              <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={onlyMissing ? "default" : "outline"} onClick={() => setOnlyMissing((v) => !v)}>
              {onlyMissing ? "Showing missing only" : "Show missing only"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-foreground/50 text-center py-8">No records found.</p>}
          {rows.map((s) => (
            <div key={s.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 border border-border rounded-lg">
              <div className="lg:w-56 shrink-0">
                <p className="font-medium text-sm text-foreground">{s.name}</p>
                <p className="text-xs text-foreground/60">{s.class} · Roll {s.rollNo}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 text-sm">
                {parentsOf(s).map((p) => (
                  <div key={p.label}>
                    <p className="text-xs text-foreground/50">{p.label}</p>
                    {p.name ? (
                      <>
                        <p className="text-foreground">{p.name}</p>
                        <p className="text-xs text-foreground/60 flex flex-wrap gap-x-3">
                          {p.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                          {p.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>}
                        </p>
                      </>
                    ) : <p className="text-foreground/40">Not added</p>}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!hasContact(s) && <Badge variant="secondary" className="text-orange-700 dark:text-orange-300">Missing</Badge>}
                <Button variant="outline" size="sm" onClick={() => openEdit(s)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Parent Details — {editing?.name}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              {PARENT_FIELDS.map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
