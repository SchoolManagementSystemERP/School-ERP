import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Upload, Save, Download, Eye, BookOpen, BarChart3,
  Trophy, CheckCircle2, XCircle, ArrowLeft, Users,
  TrendingUp, Medal, ClipboardList, Pencil, FileText,
  ChevronRight, AlertTriangle, GraduationCap, Star,
} from "lucide-react";

import { EXAM_TYPES, MAX_MARKS, SUBJECTS } from "@/data/academics";
import { useClassRoster } from "@/store/students";
import { setMark, useMarks, type MarksStore } from "@/store/marks";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode =
  | "dashboard"
  | "subject-view"
  | "overall-view"
  | "result-card"
  | "edit-marks";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGrade(pct: number): { grade: string; color: string } {
  if (pct >= 90) return { grade: "A+", color: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" };
  if (pct >= 80) return { grade: "A",  color: "bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-300" };
  if (pct >= 70) return { grade: "B+", color: "bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-300" };
  if (pct >= 60) return { grade: "B",  color: "bg-sky-100 dark:bg-sky-500/10 text-sky-800 dark:text-sky-300" };
  if (pct >= 50) return { grade: "C",  color: "bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-300" };
  if (pct >= 33) return { grade: "D",  color: "bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-300" };
  return { grade: "F", color: "bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300" };
}

function PassBadge({ pass }: { pass: boolean }) {
  return pass
    ? <Badge className="bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-300 text-xs">Pass</Badge>
    : <Badge className="bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300 text-xs">Fail</Badge>;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  marksStore,
  onNavigate,
}: {
  marksStore: MarksStore;
  onNavigate: (view: ViewMode, cls: string, exam: string) => void;
}) {
  const { classes: CLASSES, byClass: STUDENTS_BY_CLASS } = useClassRoster();
  const [filterClass, setFilterClass] = useState("All");
  const [filterExam,  setFilterExam]  = useState(EXAM_TYPES[3]);

  // School-wide stats for chosen exam
  const stats = useMemo(() => {
    let total = 0, pass = 0, count = 0;
    const classToppers: { cls: string; name: string; pct: number }[] = [];

    CLASSES.forEach((cls) => {
      if (filterClass !== "All" && cls !== filterClass) return;
      const students = STUDENTS_BY_CLASS[cls] ?? [];
      let clsTopPct = -1, clsTopName = "";
      students.forEach((s) => {
        const subjectTotal = SUBJECTS.reduce(
          (a, subj) => a + parseFloat(marksStore[cls]?.[filterExam]?.[subj]?.[s.id] || "0"), 0
        );
        const pct = (subjectTotal / (SUBJECTS.length * MAX_MARKS)) * 100;
        const failed = SUBJECTS.some(
          (subj) => (parseFloat(marksStore[cls]?.[filterExam]?.[subj]?.[s.id] || "0") / MAX_MARKS) * 100 < 33
        );
        total++; count++;
        if (!failed) pass++;
        if (pct > clsTopPct) { clsTopPct = pct; clsTopName = s.name; }
      });
      if (clsTopName) classToppers.push({ cls, name: clsTopName, pct: clsTopPct });
    });

    return { total, pass, fail: total - pass, passRate: total ? ((pass / total) * 100).toFixed(1) : "0", classToppers };
  }, [marksStore, filterClass, filterExam, CLASSES, STUDENTS_BY_CLASS]);

  const visibleClasses = filterClass === "All" ? CLASSES : [filterClass];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
            <GraduationCap className="h-7 w-7 text-violet-600" /> Principal — Marks Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">School-wide marks management, analytics & result generation</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterExam} onValueChange={setFilterExam}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXAM_TYPES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Classes</SelectItem>
              {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* School-wide stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Students" value={stats.total}                  icon={Users}        color="bg-blue-50 dark:bg-blue-500/10 text-blue-600" />
        <StatCard label="Passed"         value={stats.pass}                   icon={CheckCircle2} color="bg-green-50 dark:bg-green-500/10 text-green-600" />
        <StatCard label="Failed"         value={stats.fail}                   icon={XCircle}      color="bg-red-50 dark:bg-red-500/10 text-red-600" />
        <StatCard label="Pass Rate"      value={`${stats.passRate}%`}         icon={TrendingUp}   color="bg-violet-50 dark:bg-violet-500/10 text-violet-600" />
      </div>

      {/* Class Toppers */}
      {stats.classToppers.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-yellow-500" /> Class Toppers — {filterExam}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.classToppers.map(({ cls, name, pct }) => (
                <div key={cls} className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-3 border border-yellow-100 dark:border-yellow-500/30">
                  <p className="text-xs text-muted-foreground">{cls}</p>
                  <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                  <p className="text-xs text-amber-600 font-medium mt-0.5">{pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-class action cards */}
      <div className="space-y-4">
        {visibleClasses.map((cls) => {
          const students = STUDENTS_BY_CLASS[cls] ?? [];
          const summaries = students.map((s) => {
            const total = SUBJECTS.reduce(
              (a, subj) => a + parseFloat(marksStore[cls]?.[filterExam]?.[subj]?.[s.id] || "0"), 0
            );
            const pct = (total / (SUBJECTS.length * MAX_MARKS)) * 100;
            const failed = SUBJECTS.some(
              (subj) => (parseFloat(marksStore[cls]?.[filterExam]?.[subj]?.[s.id] || "0") / MAX_MARKS) * 100 < 33
            );
            return { pct, failed };
          });
          const passCount = summaries.filter((s) => !s.failed).length;
          const avgPct = summaries.length
            ? (summaries.reduce((a, s) => a + s.pct, 0) / summaries.length).toFixed(1)
            : "0";

          return (
            <Card key={cls} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{cls}</h3>
                      <Badge className="bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs">{filterExam}</Badge>
                    </div>
                    <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                      <span>{students.length} students</span>
                      <span className="text-green-600 font-medium">{passCount} passed</span>
                      <span className="text-red-500 font-medium">{students.length - passCount} failed</span>
                      <span className="text-blue-600 font-medium">Avg {avgPct}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm" variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => onNavigate("subject-view", cls, filterExam)}
                    >
                      <BookOpen className="h-3.5 w-3.5" /> Subject View
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => onNavigate("overall-view", cls, filterExam)}
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> Overall & Results
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700"
                      onClick={() => onNavigate("edit-marks", cls, filterExam)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Marks
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Subject-wise View ────────────────────────────────────────────────────────

function SubjectView({
  cls, exam, marksStore, onBack,
}: {
  cls: string; exam: string; marksStore: MarksStore; onBack: () => void;
}) {
  const { classes: CLASSES, byClass: STUDENTS_BY_CLASS } = useClassRoster();
  const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0]);
  const students = STUDENTS_BY_CLASS[cls] ?? [];
  const subjectMarks = marksStore[cls]?.[exam]?.[selectedSubject] ?? {};

  const values = students.map((s) => parseFloat(subjectMarks[s.id] || "0"));
  const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "0";
  const highest = values.length ? Math.max(...values) : 0;
  const lowest  = values.length ? Math.min(...values) : 0;
  const passCount = values.filter((v) => (v / MAX_MARKS) * 100 >= 33).length;

  return (
    <div className="space-y-5">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-lg font-bold text-foreground">Subject-wise Marks</h2>
          <p className="text-xs text-muted-foreground">{cls} · {exam}</p>
        </div>
      </div>

      {/* Subject tabs */}
      <div className="flex flex-wrap gap-2">
        {SUBJECTS.map((subj) => (
          <button
            key={subj}
            onClick={() => setSelectedSubject(subj)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
              ${selectedSubject === subj
                ? "bg-violet-600 text-white border-violet-600"
                : "border-border text-muted-foreground hover:border-violet-400 bg-card"}`}
          >
            {subj}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Average"   value={`${avg}/${MAX_MARKS}`}                              icon={TrendingUp}   color="bg-blue-50 dark:bg-blue-500/10 text-blue-600" />
        <StatCard label="Highest"   value={`${highest}/${MAX_MARKS}`}                          icon={Trophy}       color="bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600" />
        <StatCard label="Lowest"    value={`${lowest}/${MAX_MARKS}`}                           icon={AlertTriangle} color="bg-orange-50 dark:bg-orange-500/10 text-orange-600" />
        <StatCard label="Pass / Fail" value={`${passCount} / ${students.length - passCount}`} icon={CheckCircle2} color="bg-green-50 dark:bg-green-500/10 text-green-600" />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{selectedSubject} — {exam} — {cls}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead className="w-20">Roll No</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead className="text-right">Percentage</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...students]
                  .map((s) => ({ ...s, m: parseFloat(subjectMarks[s.id] || "0") }))
                  .sort((a, b) => b.m - a.m)
                  .map((s, idx) => {
                    const pct = (s.m / MAX_MARKS) * 100;
                    const { grade, color } = getGrade(pct);
                    return (
                      <TableRow key={s.id} className={pct < 33 ? "bg-red-50 dark:bg-red-500/10" : ""}>
                        <TableCell>
                          {idx === 0
                            ? <Medal className="h-4 w-4 text-yellow-500" />
                            : <span className="text-xs text-muted-foreground">#{idx + 1}</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.rollNo}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {s.m}<span className="text-muted-foreground font-normal text-xs">/{MAX_MARKS}</span>
                        </TableCell>
                        <TableCell className="text-right">{pct.toFixed(1)}%</TableCell>
                        <TableCell className="text-center"><Badge className={`text-xs ${color}`}>{grade}</Badge></TableCell>
                        <TableCell className="text-center"><PassBadge pass={pct >= 33} /></TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Overall View ─────────────────────────────────────────────────────────────

function OverallView({
  cls, exam, marksStore, onBack, onViewResult,
}: {
  cls: string; exam: string; marksStore: MarksStore;
  onBack: () => void; onViewResult: (id: number) => void;
}) {
  const { classes: CLASSES, byClass: STUDENTS_BY_CLASS } = useClassRoster();
  const students = STUDENTS_BY_CLASS[cls] ?? [];

  const summaries = useMemo(() => students.map((s) => {
    const subjectData = SUBJECTS.map((subj) => {
      const m = parseFloat(marksStore[cls]?.[exam]?.[subj]?.[s.id] || "0");
      return { subject: subj, marks: m, pct: (m / MAX_MARKS) * 100 };
    });
    const total    = subjectData.reduce((a, d) => a + d.marks, 0);
    const maxTotal = SUBJECTS.length * MAX_MARKS;
    const pct      = (total / maxTotal) * 100;
    const failed   = subjectData.filter((d) => d.pct < 33);
    return { ...s, subjectData, total, maxTotal, pct, ...getGrade(pct), status: failed.length === 0 ? "Pass" : "Fail", failedSubjects: failed };
  }), [cls, exam, marksStore, students]);

  const classAvg  = summaries.length ? (summaries.reduce((a, s) => a + s.pct, 0) / summaries.length).toFixed(1) : "0";
  const passCount = summaries.filter((s) => s.status === "Pass").length;
  const topper    = summaries.length ? summaries.reduce((a, b) => a.pct > b.pct ? a : b) : null;

  const subjectAvgs = SUBJECTS.map((subj) => {
    const avg = summaries.reduce((a, s) => a + (s.subjectData.find((d) => d.subject === subj)?.marks ?? 0), 0) / (summaries.length || 1);
    return { subject: subj, avg: avg.toFixed(1) };
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-lg font-bold text-foreground">Overall Performance</h2>
          <p className="text-xs text-muted-foreground">{cls} · {exam}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" /> Export Report
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Class Average" value={`${classAvg}%`}                                     icon={TrendingUp}   color="bg-blue-50 dark:bg-blue-500/10 text-blue-600" />
        <StatCard label="Pass"          value={`${passCount}/${students.length}`}                   icon={CheckCircle2} color="bg-green-50 dark:bg-green-500/10 text-green-600" />
        <StatCard label="Fail"          value={`${students.length - passCount}/${students.length}`} icon={XCircle}      color="bg-red-50 dark:bg-red-500/10 text-red-600" />
        <StatCard label="Class Topper"  value={topper?.name.split(" ")[0] ?? "—"}                  icon={Medal}        color="bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600" />
      </div>

      {/* Subject averages */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Subject-wise Class Average</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {subjectAvgs.map(({ subject, avg }) => {
              const pct = (parseFloat(avg) / MAX_MARKS) * 100;
              const { color, grade } = getGrade(pct);
              return (
                <div key={subject} className="text-center p-3 rounded-xl bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground truncate">{subject}</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">{avg}</p>
                  <Badge className={`text-xs mt-1 ${color}`}>{grade}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Student table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Student-wise Rankings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead className="w-20">Roll No</TableHead>
                  <TableHead>Student</TableHead>
                  {SUBJECTS.map((s) => (
                    <TableHead key={s} className="text-right hidden md:table-cell text-xs">{s.slice(0, 4)}.</TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Result</TableHead>
                  <TableHead className="text-center">Card</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...summaries].sort((a, b) => b.pct - a.pct).map((s, idx) => (
                  <TableRow key={s.id} className={s.status === "Fail" ? "bg-red-50/60" : ""}>
                    <TableCell>
                      {idx === 0
                        ? <Medal className="h-4 w-4 text-yellow-500" />
                        : <span className="text-xs text-muted-foreground">#{idx + 1}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.rollNo}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    {s.subjectData.map((d) => (
                      <TableCell key={d.subject} className={`text-right text-xs hidden md:table-cell ${d.pct < 33 ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                        {d.marks}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold">
                      {s.total}<span className="text-muted-foreground font-normal text-xs">/{s.maxTotal}</span>
                    </TableCell>
                    <TableCell className="text-right">{s.pct.toFixed(1)}%</TableCell>
                    <TableCell className="text-center"><Badge className={`text-xs ${s.color}`}>{s.grade}</Badge></TableCell>
                    <TableCell className="text-center"><PassBadge pass={s.status === "Pass"} /></TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-600 hover:bg-violet-50"
                        onClick={() => onViewResult(s.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  cls, exam, studentId, marksStore, onBack,
}: {
  cls: string; exam: string; studentId: number; marksStore: MarksStore; onBack: () => void;
}) {
  const { classes: CLASSES, byClass: STUDENTS_BY_CLASS } = useClassRoster();
  const student = (STUDENTS_BY_CLASS[cls] ?? []).find((s) => s.id === studentId);
  if (!student) return null;

  const subjectData = SUBJECTS.map((subj) => {
    const m = parseFloat(marksStore[cls]?.[exam]?.[subj]?.[studentId] || "0");
    const pct = (m / MAX_MARKS) * 100;
    return { subject: subj, marks: m, pct, ...getGrade(pct) };
  });

  const total      = subjectData.reduce((a, d) => a + d.marks, 0);
  const maxTotal   = SUBJECTS.length * MAX_MARKS;
  const overallPct = (total / maxTotal) * 100;
  const { grade, color } = getGrade(overallPct);
  const failedSubjs = subjectData.filter((d) => d.pct < 33);
  const status = failedSubjs.length === 0 ? "Pass" : "Fail";

  // Rank
  const allStudents = (STUDENTS_BY_CLASS[cls] ?? []).map((s) => ({
    id: s.id,
    total: SUBJECTS.reduce((a, subj) => a + parseFloat(marksStore[cls]?.[exam]?.[subj]?.[s.id] || "0"), 0),
  }));
  const rank = [...allStudents].sort((a, b) => b.total - a.total).findIndex((s) => s.id === studentId) + 1;

  const initials = student.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-lg font-bold text-foreground">Result Card</h2>
          <p className="text-xs text-muted-foreground">{cls} · {exam}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" /> Download PDF
        </Button>
      </div>

      {/* Header card */}
      <Card className={`border-2 ${status === "Pass" ? "border-green-200 dark:border-green-500/30" : "border-red-200 dark:border-red-500/30"}`}>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-violet-700 dark:text-violet-300">{initials}</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">{student.name}</h3>
                <p className="text-sm text-muted-foreground">Roll No: {student.rollNo} · {cls}</p>
                <p className="text-sm text-muted-foreground">{exam} · Academic Year 2025-26</p>
              </div>
            </div>
            <div className="flex gap-6 flex-wrap">
              {[
                { label: "Total", value: `${total}/${maxTotal}` },
                { label: "Percentage", value: `${overallPct.toFixed(1)}%` },
                { label: "Class Rank", value: `#${rank}` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                </div>
              ))}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Grade</p>
                <Badge className={`text-base px-3 py-1 ${color}`}>{grade}</Badge>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Result</p>
                {status === "Pass"
                  ? <Badge className="bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-300 text-base px-3 py-1">✓ Pass</Badge>
                  : <Badge className="bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300 text-base px-3 py-1">✗ Fail</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subject breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Subject-wise Breakdown</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="text-right">Marks</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjectData.map((d) => (
                <TableRow key={d.subject} className={d.pct < 33 ? "bg-red-50 dark:bg-red-500/10" : ""}>
                  <TableCell className="font-medium">{d.subject}</TableCell>
                  <TableCell className={`text-right font-semibold ${d.pct < 33 ? "text-red-600" : ""}`}>{d.marks}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{MAX_MARKS}</TableCell>
                  <TableCell className="text-right">{d.pct.toFixed(1)}%</TableCell>
                  <TableCell className="text-center"><Badge className={`text-xs ${d.color}`}>{d.grade}</Badge></TableCell>
                  <TableCell className="text-center"><PassBadge pass={d.pct >= 33} /></TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right text-violet-600">{total}</TableCell>
                <TableCell className="text-right text-muted-foreground">{maxTotal}</TableCell>
                <TableCell className="text-right">{overallPct.toFixed(1)}%</TableCell>
                <TableCell className="text-center"><Badge className={`text-xs ${color}`}>{grade}</Badge></TableCell>
                <TableCell className="text-center"><PassBadge pass={status === "Pass"} /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Principal's Remark */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Principal's Remark</p>
          {status === "Pass" ? (
            overallPct >= 80
              ? <p className="text-sm text-foreground/80">Outstanding performance. This student sets an excellent example for peers.</p>
              : <p className="text-sm text-foreground/80">Satisfactory performance. Encourage the student to aim higher next term.</p>
          ) : (
            <p className="text-sm text-red-600">
              Needs improvement. Failed in: {failedSubjs.map((d) => d.subject).join(", ")}. Please schedule remedial sessions.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Edit Marks (Principal can edit any subject / exam / class) ────────────────

function EditMarks({
  cls, defaultExam, marksStore, onMarksChange, onBack,
}: {
  cls: string; defaultExam: string; marksStore: MarksStore;
  onMarksChange: (cls: string, exam: string, subj: string, studentId: number, val: string) => void;
  onBack: () => void;
}) {
  const { classes: CLASSES, byClass: STUDENTS_BY_CLASS } = useClassRoster();
  const [exam,    setExam]    = useState(defaultExam);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [saved,   setSaved]   = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const students    = STUDENTS_BY_CLASS[cls] ?? [];
  const currentMarks = marksStore[cls]?.[exam]?.[subject] ?? {};

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const stats = useMemo(() => {
    const vals = students.map((s) => parseFloat(currentMarks[s.id] || "0"));
    const avg  = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "0";
    const pass = vals.filter((v) => (v / MAX_MARKS) * 100 >= 33).length;
    return { avg, pass };
  }, [currentMarks, students]);

  return (
    <div className="space-y-5">
      {/* Toast */}
      {saved && (
        <div className="fixed bottom-5 right-5 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Marks saved successfully!
        </div>
      )}

      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="text-lg font-bold text-foreground">Edit Marks</h2>
          <p className="text-xs text-muted-foreground">{cls}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setCsvOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Bulk CSV
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700" onClick={handleSave}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>

      {/* Exam + Subject selectors */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Exam Type</Label>
              <Select value={exam} onValueChange={setExam}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Subject"    value={subject}                         icon={BookOpen}     color="bg-violet-50 dark:bg-violet-500/10 text-violet-600" />
        <StatCard label="Exam"       value={exam}                            icon={ClipboardList} color="bg-blue-50 dark:bg-blue-500/10 text-blue-600" />
        <StatCard label="Avg Marks"  value={`${stats.avg}/${MAX_MARKS}`}    icon={TrendingUp}   color="bg-green-50 dark:bg-green-500/10 text-green-600" />
        <StatCard label="Passing"    value={`${stats.pass}/${students.length}`} icon={CheckCircle2} color="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600" />
      </div>

      {/* Marks table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Pencil className="h-4 w-4 text-violet-500" />
            {subject} — {exam} — {cls}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Roll No</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead className="text-center w-32">Marks (/{MAX_MARKS})</TableHead>
                <TableHead className="text-center">%</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => {
                const val = currentMarks[s.id] ?? "";
                const m   = parseFloat(val || "0");
                const pct = (m / MAX_MARKS) * 100;
                const { grade, color } = getGrade(pct);
                return (
                  <TableRow key={s.id} className={val && pct < 33 ? "bg-red-50 dark:bg-red-500/10" : ""}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.rollNo}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number" min={0} max={MAX_MARKS}
                        value={val}
                        onChange={(e) => onMarksChange(cls, exam, subject, s.id, e.target.value)}
                        className="w-24 h-8 text-sm text-center mx-auto"
                        placeholder="—"
                      />
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {val ? `${pct.toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {val && <Badge className={`text-xs ${color}`}>{grade}</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      {val && <PassBadge pass={pct >= 33} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CSV Dialog */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Upload via CSV</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-1 block">Upload CSV File</Label>
              <Input type="file" accept=".csv" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Format: Roll No, Marks</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5 text-xs" size="sm">
                <Download className="h-3.5 w-3.5" /> Download Template
              </Button>
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-xs" size="sm"
                onClick={() => setCsvOpen(false)}>
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export function PrincipalMarks() {
  const marksStore = useMarks();
  const [viewMode,   setViewMode]   = useState<ViewMode>("dashboard");
  const [activeCls,  setActiveCls]  = useState("");
  const [activeExam, setActiveExam] = useState(EXAM_TYPES[3]);
  const [resultStudentId, setResultStudentId] = useState<number | null>(null);

  const handleMarksChange = setMark;

  const navigate = useCallback((view: ViewMode, cls: string, exam: string) => {
    setActiveCls(cls);
    setActiveExam(exam);
    setViewMode(view);
    setResultStudentId(null);
  }, []);

  // Result card
  if (viewMode === "result-card" && resultStudentId !== null) {
    return (
      <ResultCard
        cls={activeCls} exam={activeExam}
        studentId={resultStudentId}
        marksStore={marksStore}
        onBack={() => setViewMode("overall-view")}
      />
    );
  }

  // Overall view
  if (viewMode === "overall-view") {
    return (
      <OverallView
        cls={activeCls} exam={activeExam}
        marksStore={marksStore}
        onBack={() => setViewMode("dashboard")}
        onViewResult={(id) => { setResultStudentId(id); setViewMode("result-card"); }}
      />
    );
  }

  // Subject view
  if (viewMode === "subject-view") {
    return (
      <SubjectView
        cls={activeCls} exam={activeExam}
        marksStore={marksStore}
        onBack={() => setViewMode("dashboard")}
      />
    );
  }

  // Edit marks
  if (viewMode === "edit-marks") {
    return (
      <EditMarks
        cls={activeCls} defaultExam={activeExam}
        marksStore={marksStore}
        onMarksChange={handleMarksChange}
        onBack={() => setViewMode("dashboard")}
      />
    );
  }

  // Dashboard (default)
  return <Dashboard marksStore={marksStore} onNavigate={navigate} />;
}

export default PrincipalMarks;