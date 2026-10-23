import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  ClipboardCheck,
  FileText,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Award,
} from "lucide-react";
import { MAX_MARKS } from "@/data/academics";
import { shortClassName } from "@/data/classes";
import { attendanceTotals, examHistory, rankInClass, subjectAttendance } from "@/lib/studentStats";
import { studentAssignmentStatus, useAssignments } from "@/store/assignments";
import { useAttendanceRecords } from "@/store/attendance";
import { usePublishedExamNames } from "@/store/exams";
import { useMarks } from "@/store/marks";
import { useCurrentStudent } from "@/store/session";
import { useClassRoster } from "@/store/students";
import { StatCard, toneFrom } from "@/components/common/StatCard";
import { useSectionBase } from "@/lib/section";

export function StudentDashboard() {
  const base = useSectionBase();
  const student = useCurrentStudent();
  const marks = useMarks();
  const records = useAttendanceRecords();
  const { byClass } = useClassRoster();
  const allAssignments = useAssignments();
  const published = usePublishedExamNames();
  if (!student) return null;

  const myAssignments = allAssignments
    .filter((a) => a.class === student.class)
    .map((a) => ({ ...a, myStatus: studentAssignmentStatus(a, student.id) }));
  const pendingCount = myAssignments.filter((a) => a.myStatus === "pending" || a.myStatus === "overdue").length;

  const history = examHistory(marks, student.class, student.id).filter((r) => published.has(r.exam));
  const latest = history.at(-1);
  const previous = history.at(-2);
  const scoreChange = latest && previous ? latest.percentage - previous.percentage : null;
  const classmates = (byClass[student.class] ?? []).map((s) => s.id);
  const rank = latest ? rankInClass(marks, student.class, latest.exam, classmates, student.id) : null;
  const attendanceRows = subjectAttendance(records, shortClassName(student.class), student.id);
  const attendance = attendanceTotals(attendanceRows);

  const stats = [
    {
      title: "Overall Score",
      value: latest ? `${latest.percentage.toFixed(1)}%` : "—",
      change: scoreChange === null ? (latest ? latest.exam : "No results yet") : `${scoreChange >= 0 ? "+" : ""}${scoreChange.toFixed(1)}% vs ${previous!.exam}`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100 dark:bg-emerald-950",
    },
    {
      title: "Attendance",
      value: attendance.total ? `${Math.round(attendance.percentage)}%` : "—",
      change: !attendance.total ? "Not recorded yet" : attendance.percentage >= 90 ? "Excellent" : attendance.percentage >= 75 ? "Good" : "Below 75% — needs attention",
      icon: ClipboardCheck,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-950",
    },
    {
      title: "Pending Tasks",
      value: String(pendingCount),
      change: pendingCount === 1 ? "Assignment" : "Assignments",
      icon: BookOpen,
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-950",
    },
    {
      title: "Upcoming Tests",
      value: "2",
      change: "This Week",
      icon: FileText,
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-950",
    },
  ];

  const recentMarks = (latest?.subjects ?? []).map((s) => ({ subject: s.subject, marks: s.marks, total: MAX_MARKS, grade: s.grade }));

  const upcomingAssignments = myAssignments
    .filter((a) => a.myStatus !== "graded")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4)
    .map((a) => ({
      title: a.title,
      subject: a.subject,
      dueDate: new Date(`${a.dueDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      status: a.myStatus === "submitted" ? "submitted" : "pending",
    }));

  const attendanceBySubject = attendanceRows.map((r) => ({ subject: r.subject, percentage: r.percentage }));

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
            {base === "/parent" ? `${student.firstName || student.name}'s Progress` : <>Welcome back, {student.firstName || student.name} 👋</>}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's your academic overview for this month
          </p>
        </div>
        {rank && (
          <div className="flex items-center gap-2 text-sm bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-full">
            <Award className="h-4 w-4" />
            Rank {rank.rank} of {rank.outOf} in {student.class}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} label={stat.title} value={stat.value} hint={stat.change} icon={stat.icon} tone={toneFrom(stat.color)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Marks */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Recent Test Results{latest ? ` — ${latest.exam}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {recentMarks.length === 0 && <p className="text-sm text-muted-foreground">No marks entered yet.</p>}
            {recentMarks.map((mark, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-2">
                    <p className="font-medium text-foreground">{mark.subject}</p>
                    <Badge variant={mark.grade === "A+" ? "default" : "secondary"} className="font-mono">
                      {mark.grade}
                    </Badge>
                  </div>
                  <Progress value={(mark.marks / mark.total) * 100} className="h-2.5" />
                </div>
                <div className="text-right min-w-[60px]">
                  <p className="font-bold text-lg">{mark.marks}</p>
                  <p className="text-xs text-muted-foreground">/{mark.total}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Assignments */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-600" />
              Upcoming Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingAssignments.length === 0 && <p className="text-sm text-muted-foreground">No upcoming assignments.</p>}
            {upcomingAssignments.map((assignment, index) => (
              <div key={index} className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-accent transition-colors">
                <div>
                  <p className="font-medium text-foreground">{assignment.title}</p>
                  <p className="text-sm text-muted-foreground">{assignment.subject}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Due {assignment.dueDate}</p>
                  {assignment.status === "submitted" ? (
                    <div className="flex items-center gap-1 text-green-600 text-xs mt-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Submitted
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-600 text-xs mt-1">
                      <Clock className="h-3.5 w-3.5" />
                      Pending
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Attendance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Attendance by Subject
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {attendanceBySubject.length === 0 && <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>}
          {attendanceBySubject.map((subject, index) => (
            <div key={index} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{subject.subject}</p>
                <Badge variant={subject.percentage >= 90 ? "default" : "secondary"}>
                  {subject.percentage.toFixed(1)}%
                </Badge>
              </div>
              <Progress value={subject.percentage} className="h-3" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Announcements */}
      <Card className="border-amber-200 dark:border-amber-500/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
            <AlertCircle className="h-5 w-5" />
            Important Updates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-card rounded-xl border border-amber-100 dark:border-amber-800">
            <p className="font-medium">Mid-Term Exams Schedule Released</p>
            <p className="text-sm text-muted-foreground mt-1">Exams will begin from June 10, 2026. Check detailed timetable.</p>
          </div>
          <div className="p-4 bg-card rounded-xl border border-amber-100 dark:border-amber-800">
            <p className="font-medium">Fee Reminder</p>
            <p className="text-sm text-muted-foreground mt-1">Second installment due by May 31. Late fee applies after due date.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}