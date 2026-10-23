import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { parseClassName, shortClassName } from "@/data/classes";
import { attendanceTotals, subjectAttendance } from "@/lib/studentStats";
import { LOW_ATTENDANCE_THRESHOLD, useAttendanceRecords } from "@/store/attendance";
import { examStatus, useExams } from "@/store/exams";
import { feeAccount, useFeePayments } from "@/store/fees";
import { useClassRoster, useStudents } from "@/store/students";

/** Who can be issued an admit card for an exam, and why some are provisional. */
export function AdmitCards() {
  const exams = useExams().filter((e) => examStatus(e) !== "Completed");
  const { students } = useStudents();
  const { classes } = useClassRoster();
  const records = useAttendanceRecords();
  const payments = useFeePayments();
  const [examId, setExamId] = useState(String(exams[0]?.id ?? ""));
  const [cls, setCls] = useState("all");
  const exam = exams.find((e) => String(e.id) === examId);

  const rows = !exam ? [] : students
    .filter((s) => exam.grades.includes(parseClassName(s.class).grade) && (cls === "all" || s.class === cls))
    .map((s) => {
      const att = attendanceTotals(subjectAttendance(records, shortClassName(s.class), s.id));
      const fee = feeAccount(s, payments);
      const issues: string[] = [];
      if (fee.overdueAmount > 0) issues.push(`Fee ₹${fee.overdueAmount.toLocaleString("en-IN")} overdue`);
      if (att.total && att.percentage < LOW_ATTENDANCE_THRESHOLD) issues.push(`Attendance ${Math.round(att.percentage)}%`);
      return { s, issues };
    })
    .sort((a, b) => b.issues.length - a.issues.length || a.s.rollNo.localeCompare(b.s.rollNo));

  const eligible = rows.filter((r) => r.issues.length === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admit Cards"
        description="Students download their own admit card; provisional ones need fees or attendance cleared"
        actions={
          <div className="flex gap-2">
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Exam" /></SelectTrigger>
              <SelectContent>{exams.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={cls} onValueChange={setCls}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {!exam ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No upcoming exam. Schedule one first.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Candidates" value={rows.length} icon={Users} tone="indigo" />
            <StatCard label="Eligible" value={eligible} icon={CheckCircle2} tone="green" />
            <StatCard label="Provisional" value={rows.length - eligible} icon={AlertTriangle} tone="amber" />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">{exam.name} · Classes {exam.grades.join(", ")}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ s, issues }) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.rollNo}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.class}</TableCell>
                      <TableCell>{issues.length ? <Badge variant="outline" className="text-amber-600">Provisional</Badge> : <Badge className="bg-emerald-600">Eligible</Badge>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{issues.join(" · ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
