import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, GraduationCap, IndianRupee, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { EXAM_TYPES } from "@/data/academics";
import { attendanceTotals, examResult, subjectAttendance } from "@/lib/studentStats";
import { LOW_ATTENDANCE_THRESHOLD, useAttendanceRecords } from "@/store/attendance";
import { feeAccount, useFeePayments } from "@/store/fees";
import { useMarks } from "@/store/marks";
import { useCurrentTeacher } from "@/store/session";
import { useClassRoster } from "@/store/students";

/** Class teacher view: everything about the teacher's own class in one place. */
export function MyClass() {
  const teacher = useCurrentTeacher();
  const { byClass } = useClassRoster();
  const records = useAttendanceRecords();
  const marks = useMarks();
  const payments = useFeePayments();

  const short = teacher?.classTeacherOf ?? "";
  const cls = `Class ${short}`;
  const students = byClass[cls] ?? [];

  if (!short || !students.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Class" description="For class teachers" />
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          {short ? `No students are enrolled in ${cls} yet.` : "You are not a class teacher this year. The principal assigns class teachers in Teacher Setup."}
        </CardContent></Card>
      </div>
    );
  }

  const latestExam = [...EXAM_TYPES].reverse().find((e) => students.some((s) => examResult(marks, cls, e, s.id))) ?? EXAM_TYPES[0];
  const rows = students.map((s) => {
    const att = attendanceTotals(subjectAttendance(records, short, s.id));
    const result = examResult(marks, cls, latestExam, s.id);
    const fee = feeAccount(s, payments);
    return { s, att: att.total ? Math.round(att.percentage) : null, result, fee };
  });
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const lowAtt = rows.filter((r) => r.att !== null && r.att < LOW_ATTENDANCE_THRESHOLD);
  const feeDue = rows.filter((r) => r.fee.overdueAmount > 0);

  return (
    <div className="space-y-6">
      <PageHeader title={`My Class · ${cls}`} description={`You are the class teacher of ${cls}`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Students" value={students.length} icon={Users} tone="indigo" />
        <StatCard label="Avg attendance" value={`${avg(rows.flatMap((r) => (r.att === null ? [] : [r.att])))}%`} icon={TrendingUp} tone="green" hint={`${lowAtt.length} below ${LOW_ATTENDANCE_THRESHOLD}%`} />
        <StatCard label={`Avg score · ${latestExam}`} value={`${avg(rows.flatMap((r) => (r.result ? [r.result.percentage] : [])))}%`} icon={GraduationCap} tone="purple" />
        <StatCard label="Fees overdue" value={feeDue.length} icon={IndianRupee} tone="amber" hint="students" />
      </div>

      {(lowAtt.length > 0 || feeDue.length > 0) && (
        <Card className="border-amber-300 dark:border-amber-500/30">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Needs Your Attention</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {lowAtt.map((r) => <Badge key={`a${r.s.id}`} variant="outline" className="py-1">{r.s.name} · attendance {r.att}%</Badge>)}
            {feeDue.map((r) => <Badge key={`f${r.s.id}`} variant="outline" className="py-1">{r.s.name} · fee overdue</Badge>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Class Register</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">{latestExam}</TableHead>
                <TableHead>Fees</TableHead>
                <TableHead>Parent contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ s, att, result, fee }) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.rollNo}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className={`text-right ${att !== null && att < LOW_ATTENDANCE_THRESHOLD ? "text-red-600 font-semibold" : ""}`}>{att === null ? "—" : `${att}%`}</TableCell>
                  <TableCell className="text-right">{result ? `${result.percentage.toFixed(0)}% (${result.grade})` : "—"}</TableCell>
                  <TableCell><Badge variant={fee.status === "Overdue" ? "destructive" : fee.status === "Paid" ? "default" : "secondary"}>{fee.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{s.fatherName ? `${s.fatherName} · ${s.fatherPhone}` : "Not on file"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
