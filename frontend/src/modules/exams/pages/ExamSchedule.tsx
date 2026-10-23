import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, CheckCircle2, Clock, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { EXAM_TYPES } from "@/data/academics";
import { daysFromToday, daysUntil } from "@/lib/dates";
import { addExam, examStatus, paperSchedule, removeExam, updateExam, useExams } from "@/store/exams";

const GRADES = [8, 9, 10, 11, 12];
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export function ExamSchedule() {
  const exams = useExams();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: EXAM_TYPES[0], start: daysFromToday(21), grades: GRADES });

  const sorted = [...exams].sort((a, b) => (a.papers[0]?.date ?? "").localeCompare(b.papers[0]?.date ?? ""));
  const upcoming = exams.filter((e) => examStatus(e) === "Upcoming").length;
  const ongoing = exams.filter((e) => examStatus(e) === "Ongoing").length;

  const create = () => {
    if (!form.grades.length) { toast.error("Choose at least one class"); return; }
    if (daysUntil(form.start) < 0) { toast.error("Start date must be today or later"); return; }
    addExam({ name: form.name, grades: [...form.grades].sort((a, b) => a - b), papers: paperSchedule(daysUntil(form.start)), resultsPublished: false });
    toast.success(`${form.name} scheduled from ${fmt(form.start)}`);
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Schedule"
        description="Plan exams, publish datesheets and release results"
        actions={<Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Schedule Exam</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Exams this year" value={exams.length} icon={FileText} tone="indigo" />
        <StatCard label="Upcoming" value={upcoming} icon={CalendarDays} tone="blue" />
        <StatCard label="In progress" value={ongoing} icon={Clock} tone="amber" />
        <StatCard label="Results published" value={exams.filter((e) => e.resultsPublished).length} icon={CheckCircle2} tone="green" />
      </div>

      <div className="space-y-4">
        {sorted.map((e) => {
          const status = examStatus(e);
          return (
            <Card key={e.id} className="gap-0">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {e.name}
                    <Badge variant={status === "Completed" ? "secondary" : status === "Ongoing" ? "default" : "outline"}>{status}</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Classes {e.grades.join(", ")} · {e.papers[0] && fmt(e.papers[0].date)} – {e.papers.at(-1) && fmt(e.papers.at(-1)!.date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={e.resultsPublished}
                      onCheckedChange={(v) => { updateExam(e.id, { resultsPublished: v }); toast.success(v ? `${e.name} results published to students & parents` : `${e.name} results hidden`); }}
                    />
                    Results published
                  </label>
                  {status === "Upcoming" && (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Cancel exam" onClick={() => { removeExam(e.id); toast.success(`${e.name} cancelled`); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                {e.papers.map((p) => (
                  <div key={p.subject} className="rounded-lg border border-border p-2.5 text-xs">
                    <p className="font-medium text-foreground text-sm">{p.subject}</p>
                    <p className="text-muted-foreground">{fmt(p.date)}</p>
                    <p className="text-muted-foreground">{p.time}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Schedule Exam</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Exam</Label>
              <Select value={form.name} onValueChange={(v) => setForm({ ...form, name: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXAM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>First paper on</Label><Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Classes</Label>
              <div className="flex flex-wrap gap-2">
                {GRADES.map((g) => {
                  const on = form.grades.includes(g);
                  return (
                    <Button key={g} type="button" size="sm" variant={on ? "default" : "outline"} onClick={() => setForm({ ...form, grades: on ? form.grades.filter((x) => x !== g) : [...form.grades, g] })}>
                      Class {g}
                    </Button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">One paper every other day (Sundays skipped), 9:30 AM – 12:30 PM.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Schedule</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
