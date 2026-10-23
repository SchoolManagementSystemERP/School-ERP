import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Search, Trash2, Upload, Users, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { downloadNote, removeNote, useNotes } from "@/store/notes";
import { useClassRoster } from "@/store/students";

export function PrincipalNotes() {
  const notes = useNotes();
  const { classes } = useClassRoster();
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");

  const subjects = useMemo(() => [...new Set(notes.map((n) => n.subject))].sort(), [notes]);

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase();
    const matchSearch = !q || n.title.toLowerCase().includes(q) || n.uploadedBy.toLowerCase().includes(q);
    return matchSearch && (filterClass === "all" || n.class === filterClass) && (filterSubject === "all" || n.subject === filterSubject);
  });

  const byTeacher = useMemo(() => {
    const map = new Map<string, { count: number; downloads: number }>();
    for (const n of notes) {
      const row = map.get(n.uploadedBy) ?? { count: 0, downloads: 0 };
      map.set(n.uploadedBy, { count: row.count + 1, downloads: row.downloads + n.downloads });
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [notes]);

  const classesWithoutNotes = classes.filter((c) => !notes.some((n) => n.class === c));

  const stats = [
    { label: "Notes Shared", value: notes.length, icon: FileText, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
    { label: "Total Downloads", value: notes.reduce((a, n) => a + n.downloads, 0), icon: Download, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Contributing Teachers", value: byTeacher.length, icon: Users, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
    { label: "Classes Covered", value: `${classes.length - classesWithoutNotes.length}/${classes.length}`, icon: BookOpen, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Notes</h1>
        <p className="text-sm text-muted-foreground mt-1">Study material shared by teachers across all classes</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-foreground/60 mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">All Notes</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                <Input placeholder="Search title or teacher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSubject} onValueChange={setFilterSubject}>
                <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.length === 0 && <p className="text-sm text-foreground/50 text-center py-8">No notes found.</p>}
            {filtered.map((n) => (
              <div key={n.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-border rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{n.title}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Badge variant="outline">{n.subject}</Badge>
                    <Badge variant="outline">{n.class}</Badge>
                  </div>
                  <p className="text-xs text-foreground/50 mt-1.5">
                    {n.uploadedBy} · {n.uploadDate} · {n.fileName} ({n.fileSize}) · {n.downloads} downloads
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { downloadNote(n); toast.success(`Downloading ${n.fileName}...`); }}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline" size="sm" className="text-destructive hover:text-destructive"
                    onClick={() => { removeNote(n.id); toast.success(`"${n.title}" removed`); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">By Teacher</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {byTeacher.map(([name, row]) => (
                <div key={name} className="flex items-center justify-between text-sm p-2 rounded-lg bg-accent/30">
                  <span className="text-foreground">{name}</span>
                  <span className="text-foreground/60">{row.count} notes · {row.downloads} downloads</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4 text-orange-600" /> Classes Without Notes</CardTitle></CardHeader>
            <CardContent>
              {classesWithoutNotes.length === 0
                ? <p className="text-sm text-foreground/60">Every class has study material.</p>
                : <div className="flex flex-wrap gap-1.5">{classesWithoutNotes.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
