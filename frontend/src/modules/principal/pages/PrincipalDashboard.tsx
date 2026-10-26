import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, GraduationCap, Wallet, Package, Library, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { EXAM_TYPES } from "@/data/academics";
import { shortClassName } from "@/data/classes";
import { examResult, subjectAttendance } from "@/lib/studentStats";
import { LOW_ATTENDANCE_THRESHOLD, useAttendanceRecords } from "@/store/attendance";
import { feeAccount, useFeePayments } from "@/store/fees";
import { inventorySummary, useInventorySettings, useItems } from "@/store/inventory";
import { librarySummary, useBooks, useLoans, useStudentLookup } from "@/store/library";
import { useMarks } from "@/store/marks";
import { useNotes } from "@/store/notes";
import { useClassRoster, useStudents } from "@/store/students";
import { useTeachers } from "@/store/teachers";
import { currentAcademicYear } from "@/store/classes";
import { StatCard, toneFrom } from "@/components/common/StatCard";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const inr = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${Math.round(n / 1000)}K`);

export function PrincipalDashboard() {
  const { students } = useStudents();
  const { classes, byClass } = useClassRoster();
  const { teachers } = useTeachers();
  const marks = useMarks();
  const records = useAttendanceRecords();
  const payments = useFeePayments();
  const items = useItems();
  const invSettings = useInventorySettings();
  const books = useBooks();
  const loans = useLoans();
  const notes = useNotes();
  const lookup = useStudentLookup();

  // attendance per class (short name) from period records
  const attendanceByClass = new Map<string, { present: number; total: number }>();
  for (const r of records) {
    const row = attendanceByClass.get(r.className) ?? { present: 0, total: 0 };
    for (const p of r.periods) for (const e of p.entries) { row.total++; if (e.status === "present") row.present++; }
    attendanceByClass.set(r.className, row);
  }
  const allAtt = [...attendanceByClass.values()].reduce((a, r) => ({ present: a.present + r.present, total: a.total + r.total }), { present: 0, total: 0 });

  const fees = students.map((st) => feeAccount(st, payments));
  const feeBilled = fees.reduce((a, f) => a + f.total, 0);
  const feeCollected = fees.reduce((a, f) => a + f.paid, 0);
  const feeOverdue = fees.reduce((a, f) => a + f.overdueAmount, 0);

  const inv = inventorySummary(items, [], invSettings);
  const lib = librarySummary(books, loans, lookup);
  const lowAttendance = students.filter((st) => {
    const rows = subjectAttendance(records, shortClassName(st.class), st.id);
    const t = rows.reduce((a, r) => ({ p: a.p + r.present, n: a.n + r.total }), { p: 0, n: 0 });
    return t.n > 0 && (t.p / t.n) * 100 < LOW_ATTENDANCE_THRESHOLD;
  }).length;
  const onLeave = teachers.filter((t) => t.status === "On Leave").length;

  const stats = [
    { label: "Total Students", value: String(students.length), change: `${classes.length} classes`, icon: GraduationCap, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20" },
    { label: "Total Teachers", value: String(teachers.length), change: onLeave ? `${onLeave} on leave` : "All active", icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Fee Collected", value: inr(feeCollected), change: `${pct(feeCollected, feeBilled)}% collected`, icon: Wallet, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/20" },
    { label: "Inventory Items", value: String(inv.totalItems), change: `${inv.lowStock.length} low stock`, icon: Package, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
    { label: "Library Books", value: lib.totalCopies.toLocaleString("en-IN"), change: `${lib.issued} issued`, icon: Library, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/20" },
    { label: "Avg Attendance", value: `${pct(allAtt.present, allAtt.total)}%`, change: "last 5 school days", icon: TrendingUp, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-900/20" },
  ];

  const alerts = [
    inv.lowStock.length && { type: "warning", message: `${inv.lowStock.length} inventory items are low on stock`, icon: AlertTriangle, color: "text-orange-600" },
    lowAttendance && { type: "warning", message: `${lowAttendance} students have attendance below ${LOW_ATTENDANCE_THRESHOLD}%`, icon: AlertTriangle, color: "text-red-600" },
    feeOverdue && { type: "warning", message: `${inr(feeOverdue)} in fees is overdue`, icon: AlertTriangle, color: "text-yellow-600" },
    lib.overdue && { type: "warning", message: `${lib.overdue} library books are overdue`, icon: AlertTriangle, color: "text-orange-600" },
    { type: "success", message: `${notes.length} study notes shared by teachers`, icon: CheckCircle, color: "text-green-600" },
  ].filter(Boolean) as { type: string; message: string; icon: typeof CheckCircle; color: string }[];

  const latestExam = [...EXAM_TYPES].reverse().find((exam) => classes.some((c) => Object.keys(marks[c]?.[exam] ?? {}).length)) ?? EXAM_TYPES[0];
  const classPerformance = classes.map((cls) => {
    const list = byClass[cls] ?? [];
    const scores = list.map((st) => examResult(marks, cls, latestExam, st.id)?.percentage).filter((x): x is number => x !== undefined);
    const avgMarks = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const att = attendanceByClass.get(shortClassName(cls));
    const avgAttendance = att ? pct(att.present, att.total) : 0;
    const status = avgMarks >= 75 && avgAttendance >= 90 ? "Excellent" : avgMarks >= 60 && avgAttendance >= 80 ? "Good" : "Average";
    return { class: cls, students: list.length, avgAttendance, avgMarks, status };
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Principal Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">School-wide overview — Academic Year {currentAcademicYear}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.change} icon={stat.icon} tone={toneFrom(stat.color)} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts */}
        <Card>
          <CardHeader><CardTitle className="text-base">Alerts & Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-accent/30">
                <alert.icon className={`h-4 w-4 mt-0.5 shrink-0 ${alert.color}`} />
                <p className="text-sm text-foreground/80">{alert.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Class Performance */}
        <Card>
          <CardHeader><CardTitle className="text-base">Class-wise Performance <span className="text-xs font-normal text-foreground/50">· {latestExam}</span></CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {classPerformance.map((cls) => (
                <div key={cls.class} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-foreground">{cls.class}</p>
                    <p className="text-xs text-foreground/50">{cls.students} students</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-foreground/50">Attendance</p>
                      <p className={`text-sm font-semibold ${cls.avgAttendance >= 90 ? "text-green-600" : cls.avgAttendance >= 80 ? "text-yellow-600" : "text-red-600"}`}>{cls.avgAttendance}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-foreground/50">Avg Marks</p>
                      <p className="text-sm font-semibold text-foreground">{cls.avgMarks}%</p>
                    </div>
                    <Badge className={cls.status === "Excellent" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : cls.status === "Good" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"}>
                      {cls.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}