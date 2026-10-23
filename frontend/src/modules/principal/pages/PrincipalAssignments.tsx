import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { assignmentStatus, useAssignments } from "@/store/assignments";
import { useClassRoster } from "@/store/students";
import {
  BookOpen, Users, CheckCircle2, AlertTriangle,
  TrendingUp, Eye, Search, ChevronDown, ChevronUp,
  Award, Clock, XCircle, BarChart3, Filter
} from "lucide-react";

// ─── DATA ──────────────────────────────────────────────────────────────────

// ─── HELPERS ───────────────────────────────────────────────────────────────

const CLASS_PALETTE = [
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
];
const classColor = (c: string) => classColors[c] ?? CLASS_PALETTE[[...c].reduce((h, ch) => h + ch.charCodeAt(0), 0) % CLASS_PALETTE.length];
const subjectColor = (s: string) => subjectColors[s] ?? "bg-muted/50 text-foreground/80 border-border";

const classColors: Record<string, string> = {
  "Class 10-A": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "Class 10-B": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Class 9-A":  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Class 9-B":  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

const subjectColors: Record<string, string> = {
  "Mathematics": "bg-indigo-50 text-indigo-700 border-indigo-200 dark:border-indigo-500/30 dark:bg-indigo-900/20 dark:text-indigo-300",
  "Physics":     "bg-sky-50 text-sky-700 border-sky-200 dark:border-sky-500/30 dark:bg-sky-900/20 dark:text-sky-300",
  "Chemistry":   "bg-pink-50 text-pink-700 border-pink-200 dark:border-pink-500/30 dark:bg-pink-900/20 dark:text-pink-300",
  "English":     "bg-amber-50 text-amber-700 border-amber-200 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300",
};

const statusStyles: Record<string, string> = {
  active:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  upcoming: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  closed:   "bg-muted text-muted-foreground",
};

function getRegularityLabel(score: number) {
  if (score >= 85) return { label: "Excellent", color: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 65) return { label: "Good",      color: "text-blue-600 dark:text-blue-400" };
  if (score >= 40) return { label: "Average",   color: "text-amber-600 dark:text-amber-400" };
  return           { label: "At Risk",           color: "text-red-600 dark:text-red-400" };
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────

export function PrincipalAssignments() {
  // ── shared data ──
  const { byClass } = useClassRoster();
  const stored = useAssignments();
  const students = useMemo(
    () => Object.values(byClass).flat().map((s) => ({ id: s.id, name: s.name, class: s.class, rollNo: s.rollNo })),
    [byClass],
  );
  const teachers = useMemo(
    () => [...new Set(stored.map((a) => a.teacher))].map((name, i) => ({ id: i + 1, name })),
    [stored],
  );
  const assignments = useMemo(() => stored.map((a) => ({
    ...a,
    status: assignmentStatus(a),
    teacherId: teachers.find((t) => t.name === a.teacher)?.id ?? 0,
    submissions: a.submissions.map((sub) => ({ ...sub, onTime: sub.submittedAt <= a.dueDate })),
  })), [stored, teachers]);

  const getStudentClassmates = (classLabel: string) => students.filter(s => s.class === classLabel);
  const getStudentRegularityScore = (studentId: number) => {
    const relevant = assignments.filter(a => getStudentClassmates(a.class).some(s => s.id === studentId));
    if (!relevant.length) return 0;
    const submitted = relevant.filter(a => a.submissions.some(s => s.studentId === studentId)).length;
    return Math.round((submitted / relevant.length) * 100);
  };

  const [searchQuery, setSearchQuery]       = useState("");
  const [filterClass, setFilterClass]       = useState("all");
  const [filterSubject, setFilterSubject]   = useState("all");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [activeTab, setActiveTab]           = useState<"assignments" | "students">("assignments");
  const [expandedId, setExpandedId]         = useState<number | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<(typeof assignments)[number] | null>(null);
  const [dialogOpen, setDialogOpen]         = useState(false);
  const [studentSearch, setStudentSearch]   = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("all");

  // ── filtered assignments ──
  const filteredAssignments = useMemo(() => assignments.filter(a => {
    const q = searchQuery.toLowerCase();
    const matchSearch  = a.title.toLowerCase().includes(q) ||
                         a.subject.toLowerCase().includes(q) ||
                         teachers.find(t => t.id === a.teacherId)?.name.toLowerCase().includes(q);
    const matchClass   = filterClass   === "all" || a.class   === filterClass;
    const matchSubject = filterSubject === "all" || a.subject === filterSubject;
    const matchStatus  = filterStatus  === "all" || a.status  === filterStatus;
    return matchSearch && matchClass && matchSubject && matchStatus;
  }), [searchQuery, filterClass, filterSubject, filterStatus, assignments, teachers]);

  // ── student regularity list ──
  const studentRows = useMemo(() => {
    return students
      .filter(s => {
        const q = studentSearch.toLowerCase();
        const classMatch = studentClassFilter === "all" || s.class === studentClassFilter;
        return classMatch && (s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q));
      })
      .map(s => {
        const score = getStudentRegularityScore(s.id);
        const { label, color } = getRegularityLabel(score);
        const relevant = assignments.filter(a => getStudentClassmates(a.class).some(st => st.id === s.id));
        const submitted = relevant.filter(a => a.submissions.some(sub => sub.studentId === s.id));
        const onTime    = submitted.filter(a => a.submissions.find(sub => sub.studentId === s.id)?.onTime);
        return { ...s, score, label, color, total: relevant.length, submitted: submitted.length, onTime: onTime.length };
      })
      .sort((a, b) => b.score - a.score);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSearch, studentClassFilter, students, assignments]);

  // ── summary stats ──
  const totalSubmissions = assignments.reduce((acc, a) => acc + a.submissions.length, 0);
  const avgRate = Math.round(
    assignments.reduce((acc, a) => {
      const classSize = getStudentClassmates(a.class).length;
      return acc + (classSize > 0 ? a.submissions.length / classSize : 0);
    }, 0) / Math.max(1, assignments.length) * 100
  );
  const atRiskCount = students.filter(s => getStudentRegularityScore(s.id) < 40).length;

  const uniqueClasses   = [...new Set(assignments.map(a => a.class))];
  const uniqueSubjects  = [...new Set(assignments.map(a => a.subject))];

  return (
    <div >
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-indigo-500 uppercase mb-1">Principal Dashboard</p>
            <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
              Assignment Overview
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor all teachers' assignments and student submission regularity
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
            <Clock className="h-4 w-4 text-indigo-400" />
            Last updated: {format(new Date(), "dd MMM yyyy, hh:mm a")}
          </div>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Assignments", value: assignments.length, icon: BookOpen, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
            { label: "Total Submissions", value: totalSubmissions,   icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
            { label: "Avg Submission Rate", value: `${avgRate}%`,    icon: TrendingUp, color: "text-sky-600",  bg: "bg-sky-50 dark:bg-sky-900/20" },
            { label: "At-Risk Students",   value: atRiskCount,       icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-900/20" },
          ].map(stat => (
            <Card key={stat.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className={`inline-flex p-2.5 rounded-xl ${stat.bg} mb-3`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit shadow-sm">
          {(["assignments", "students"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                activeTab === tab
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "assignments" ? (
                <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" />Assignments</span>
              ) : (
                <span className="flex items-center gap-2"><Users className="h-4 w-4" />Student Regularity</span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════
            TAB 1 — ASSIGNMENTS
        ══════════════════════════════════════ */}
        {activeTab === "assignments" && (
          <div className="space-y-5">
            {/* Filters */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search assignment / teacher..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-9 h-10 text-sm"
                    />
                  </div>
                  <Select value={filterClass} onValueChange={setFilterClass}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="All Classes" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      <SelectItem value="all">All Classes</SelectItem>
                      {uniqueClasses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterSubject} onValueChange={setFilterSubject}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="All Subjects" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      <SelectItem value="all">All Subjects</SelectItem>
                      {uniqueSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(filterClass !== "all" || filterSubject !== "all" || filterStatus !== "all" || searchQuery) && (
                  <Button variant="ghost" size="sm" className="mt-3 h-8 text-xs text-indigo-600"
                    onClick={() => { setFilterClass("all"); setFilterSubject("all"); setFilterStatus("all"); setSearchQuery(""); }}>
                    <Filter className="h-3.5 w-3.5 mr-1" /> Clear all filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Assignment Cards */}
            <div className="space-y-3">
              {filteredAssignments.length === 0 && (
                <Card>
                  <CardContent className="p-12 text-center text-muted-foreground">No assignments match your filters.</CardContent>
                </Card>
              )}
              {filteredAssignments.map(assignment => {
                const teacher    = teachers.find(t => t.id === assignment.teacherId);
                const classmates = getStudentClassmates(assignment.class);
                const subRate    = classmates.length > 0
                  ? Math.round((assignment.submissions.length / classmates.length) * 100) : 0;
                const onTimeCount = assignment.submissions.filter(s => s.onTime).length;
                const isExpanded  = expandedId === assignment.id;

                return (
                  <Card key={assignment.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      {/* Main Row */}
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${subjectColor(assignment.subject)}`}>
                                {assignment.subject}
                              </span>
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${classColor(assignment.class)}`}>
                                {assignment.class}
                              </span>
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[assignment.status]}`}>
                                {assignment.status}
                              </span>
                            </div>

                            <h3 className="font-semibold text-foreground text-base sm:text-lg truncate">
                              {assignment.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              👤 {teacher?.name} &nbsp;·&nbsp; Due: {format(new Date(assignment.dueDate), "dd MMM yyyy")}
                              &nbsp;·&nbsp; {assignment.totalMarks} marks
                            </p>

                            {/* Submission progress */}
                            <div className="mt-4 space-y-1.5">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Submission Rate</span>
                                <span className="font-semibold text-foreground/80">
                                  {assignment.submissions.length}/{classmates.length} ({subRate}%)
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${subRate >= 75 ? "bg-emerald-500" : subRate >= 50 ? "bg-amber-400" : "bg-rose-500"}`}
                                  style={{ width: `${subRate}%` }}
                                />
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  {onTimeCount} on time
                                </span>
                                <span className="flex items-center gap-1">
                                  <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                  {assignment.submissions.length - onTimeCount} late
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  {classmates.length - assignment.submissions.length} pending
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col gap-2 sm:items-end sm:justify-between">
                            <Button size="sm" variant="outline"
                              className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900/20"
                              onClick={() => { setSelectedAssignment(assignment); setDialogOpen(true); }}>
                              <Eye className="h-4 w-4 mr-1" /> Details
                            </Button>
                            <Button size="sm" variant="ghost"
                              className="text-muted-foreground"
                              onClick={() => setExpandedId(isExpanded ? null : assignment.id)}>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              <span className="ml-1 text-xs">{isExpanded ? "Hide" : "Submissions"}</span>
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Submissions */}
                      {isExpanded && (
                        <div className="border-t border-border bg-muted/40 px-5 sm:px-6 py-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                            Submitted Students ({assignment.submissions.length})
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {assignment.submissions.map(sub => {
                              const student = students.find(s => s.id === sub.studentId);
                              if (!student) return null;
                              return (
                                <div key={sub.studentId}
                                  className="flex items-center justify-between bg-card rounded-lg px-3 py-2.5 shadow-sm border border-border">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{student.name}</p>
                                    <p className="text-xs text-muted-foreground">{format(new Date(sub.submittedAt), "dd MMM")}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-foreground">
                                      {sub.marksObtained ?? "—"}/{assignment.totalMarks}
                                    </p>
                                    <span className={`text-xs font-medium ${sub.onTime ? "text-emerald-600" : "text-amber-500"}`}>
                                      {sub.onTime ? "On time" : "Late"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Not submitted */}
                            {classmates
                              .filter(s => !assignment.submissions.some(sub => sub.studentId === s.id))
                              .map(s => (
                                <div key={s.id}
                                  className="flex items-center justify-between bg-rose-50/50 dark:bg-rose-900/10 rounded-lg px-3 py-2.5 border border-rose-100 dark:border-rose-900/30">
                                  <div>
                                    <p className="text-sm font-medium text-foreground/80">{s.name}</p>
                                    <p className="text-xs text-muted-foreground">{s.rollNo}</p>
                                  </div>
                                  <span className="text-xs font-medium text-rose-500 bg-rose-100 dark:bg-rose-900/30 px-2 py-0.5 rounded-full">
                                    Not submitted
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB 2 — STUDENT REGULARITY
        ══════════════════════════════════════ */}
        {activeTab === "students" && (
          <div className="space-y-5">
            {/* Legend */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Excellent (≥85%)", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
                { label: "Good (65–84%)",    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                { label: "Average (40–64%)", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                { label: "At Risk (<40%)",   color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
              ].map(l => (
                <span key={l.label} className={`text-xs font-semibold px-3 py-1 rounded-full ${l.color}`}>{l.label}</span>
              ))}
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search student name or roll no..."
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="pl-9 h-10 text-sm"
                    />
                  </div>
                  <Select value={studentClassFilter} onValueChange={setStudentClassFilter}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="All Classes" />
                    </SelectTrigger>
                    <SelectContent className="bg-background text-foreground border-border">
                      <SelectItem value="all">All Classes</SelectItem>
                      {[...new Set(students.map(s => s.class))].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Student Table — Desktop */}
            <Card className="hidden sm:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Class</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitted</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">On Time</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[180px]">Regularity</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRows.map((s, i) => (
                        <tr key={s.id}
                          className="border-b border-border hover:bg-accent transition-colors">
                          <td className="px-6 py-4 text-muted-foreground font-medium">
                            {i < 3
                              ? <Award className={`h-5 w-5 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-muted-foreground" : "text-amber-600"}`} />
                              : <span>{i + 1}</span>}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-foreground">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.rollNo}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${classColor(s.class)}`}>
                              {s.class}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-foreground/80 font-medium">
                            {s.submitted}/{s.total}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{s.onTime}</span>
                            <span className="text-muted-foreground"> / {s.submitted}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${s.score >= 85 ? "bg-emerald-500" : s.score >= 65 ? "bg-blue-500" : s.score >= 40 ? "bg-amber-400" : "bg-rose-500"}`}
                                  style={{ width: `${s.score}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-foreground/80 w-10 text-right">{s.score}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {studentRows.length === 0 && (
                    <p className="text-center py-10 text-muted-foreground text-sm">No students found.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Student Cards — Mobile */}
            <div className="sm:hidden space-y-3">
              {studentRows.map((s, i) => (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {i < 3 && (
                            <Award className={`h-4 w-4 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-muted-foreground" : "text-amber-600"}`} />
                          )}
                          <p className="font-semibold text-foreground">{s.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.rollNo}</p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${classColor(s.class)}`}>{s.class}</span>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${s.score >= 85 ? "bg-emerald-500" : s.score >= 65 ? "bg-blue-500" : s.score >= 40 ? "bg-amber-400" : "bg-rose-500"}`}
                          style={{ width: `${s.score}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-foreground/80">{s.score}%</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Submitted: <b className="text-foreground">{s.submitted}/{s.total}</b></span>
                      <span>On time: <b className="text-emerald-600 dark:text-emerald-400">{s.onTime}</b></span>
                      <span className={`font-semibold ${s.color}`}>{s.label}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {studentRows.length === 0 && (
                <Card className="border-0"><CardContent className="p-10 text-center text-muted-foreground text-sm">No students found.</CardContent></Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Assignment Detail Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedAssignment?.title}</DialogTitle>
          </DialogHeader>
          {selectedAssignment && (() => {
            const teacher    = teachers.find(t => t.id === selectedAssignment.teacherId);
            const classmates = getStudentClassmates(selectedAssignment.class);
            const subRate    = classmates.length > 0
              ? Math.round((selectedAssignment.submissions.length / classmates.length) * 100) : 0;
            const graded     = selectedAssignment.submissions.filter((s) => s.marksObtained !== undefined);
            const avgMarks   = graded.length > 0
              ? Math.round(graded.reduce((a, s) => a + (s.marksObtained ?? 0), 0) / graded.length)
              : 0;

            return (
              <div className="space-y-6 pt-2">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${subjectColor(selectedAssignment.subject)}`}>
                    {selectedAssignment.subject}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${classColor(selectedAssignment.class)}`}>
                    {selectedAssignment.class}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyles[selectedAssignment.status]}`}>
                    {selectedAssignment.status}
                  </span>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  {[
                    { label: "Teacher",    value: teacher?.name },
                    { label: "Due Date",   value: format(new Date(selectedAssignment.dueDate), "dd MMM yyyy") },
                    { label: "Total Marks", value: selectedAssignment.totalMarks },
                    { label: "Submissions", value: `${selectedAssignment.submissions.length} / ${classmates.length}` },
                    { label: "Sub. Rate",   value: `${subRate}%` },
                    { label: "Avg. Marks",  value: avgMarks || "—" },
                  ].map(item => (
                    <div key={item.label} className="bg-muted/50 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">{item.label}</p>
                      <p className="font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Submission progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Overall Submission Rate</span><span className="font-bold">{subRate}%</span>
                  </div>
                  <Progress value={subRate} className="h-3" />
                </div>

                {/* Per-student breakdown */}
                <div>
                  <p className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Student Submission Breakdown
                  </p>
                  <div className="space-y-2">
                    {classmates.map(s => {
                      const sub = selectedAssignment.submissions.find(x => x.studentId === s.id);
                      return (
                        <div key={s.id}
                          className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                            sub ? "bg-card border border-border"
                                : "bg-rose-50/60 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30"
                          }`}>
                          <div>
                            <p className="text-sm font-medium text-foreground">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.rollNo}</p>
                          </div>
                          {sub ? (
                            <div className="text-right">
                              <p className="text-sm font-semibold text-foreground">
                                {sub.marksObtained ?? "—"}/{selectedAssignment.totalMarks}
                              </p>
                              <p className={`text-xs font-medium ${sub.onTime ? "text-emerald-600" : "text-amber-500"}`}>
                                {sub.onTime ? "✓ On time" : "⚠ Late"} · {format(new Date(sub.submittedAt), "dd MMM")}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-rose-500 bg-rose-100 dark:bg-rose-900/30 px-2.5 py-1 rounded-full">
                              Not submitted
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}