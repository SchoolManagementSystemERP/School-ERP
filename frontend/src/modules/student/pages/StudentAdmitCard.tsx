import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Printer, School } from "lucide-react";
import { parseClassName, shortClassName } from "@/data/classes";
import { nextExamFor, useExams } from "@/store/exams";
import { attendanceTotals, subjectAttendance } from "@/lib/studentStats";
import { LOW_ATTENDANCE_THRESHOLD, useAttendanceRecords } from "@/store/attendance";
import { feeAccount, useFeePayments } from "@/store/fees";
import { currentAcademicYear } from "@/store/classes";
import { useCurrentStudent } from "@/store/session";

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function StudentAdmitCard() {
  const student = useCurrentStudent();
  const records = useAttendanceRecords();
  const payments = useFeePayments();
  const exams = useExams();
  if (!student) return null;

  const exam = nextExamFor(exams, parseClassName(student.class).grade);
  if (!exam) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Admit Card</h1>
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No upcoming exam has been scheduled for {student.class} yet.
        </div>
      </div>
    );
  }
  const attendance = attendanceTotals(subjectAttendance(records, shortClassName(student.class), student.id));
  const fees = feeAccount(student, payments);

  const issues: string[] = [];
  if (fees.overdueAmount > 0) issues.push(`Fee of ₹${fees.overdueAmount.toLocaleString("en-IN")} is overdue`);
  if (attendance.total && attendance.percentage < LOW_ATTENDANCE_THRESHOLD) {
    issues.push(`Attendance is ${Math.round(attendance.percentage)}% (minimum ${LOW_ATTENDANCE_THRESHOLD}%)`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Admit Card</h1>
          <p className="text-sm text-muted-foreground mt-1">{exam.name} · Academic Year {student.academicYear || currentAcademicYear}</p>
        </div>
        <Button className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print Admit Card
        </Button>
      </div>

      {issues.length > 0 ? (
        <div className="flex gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 print:hidden">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">Provisional admit card</p>
            <ul className="list-disc pl-5 text-amber-800 dark:text-amber-300 mt-1">
              {issues.map((i) => <li key={i}>{i}</li>)}
            </ul>
            <p className="text-amber-800 dark:text-amber-300 mt-1">Please clear these with the school office before the exam.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/40 dark:border-green-800 text-sm text-green-800 dark:text-green-300 print:hidden">
          <CheckCircle2 className="h-5 w-5" /> You are eligible to sit for the exam.
        </div>
      )}

      <Card className="max-w-3xl mx-auto border-2">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <School className="h-10 w-10 text-violet-600" />
              <div>
                <p className="text-xl font-bold text-foreground">Delhi Public School</p>
                <p className="text-sm text-foreground/60">Admit Card — {exam.name}</p>
              </div>
            </div>
            {issues.length > 0 && (
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 border-2 border-amber-600 rounded px-2 py-1 rotate-[-6deg]">Provisional</span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-28 h-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-3xl font-bold text-foreground/40 shrink-0">
              {student.initials}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm flex-1">
              {[
                ["Student Name", student.name],
                ["Class", student.class],
                ["Roll No.", student.rollNo],
                ["Admission No.", student.admissionNo],
                ["Father's Name", student.fatherName || "—"],
                ["Date of Birth", student.dob || "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-foreground/50 text-xs">{label}</p>
                  <p className="font-medium text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <table className="w-full text-sm border border-border">
            <thead className="bg-accent/40">
              <tr>
                <th className="text-left p-2 border-b border-border">Date</th>
                <th className="text-left p-2 border-b border-border">Subject</th>
                <th className="text-left p-2 border-b border-border">Time</th>
                <th className="text-left p-2 border-b border-border">Invigilator Sign</th>
              </tr>
            </thead>
            <tbody>
              {exam.papers.map((p) => (
                <tr key={p.subject}>
                  <td className="p-2 border-b border-border whitespace-nowrap">{fmt(p.date)}</td>
                  <td className="p-2 border-b border-border">{p.subject}</td>
                  <td className="p-2 border-b border-border whitespace-nowrap">{p.time}</td>
                  <td className="p-2 border-b border-border" />
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-xs text-foreground/60 space-y-1">
            <p>• Report to the exam hall 15 minutes before the start time.</p>
            <p>• Bring this admit card and your school ID card to every paper.</p>
            <p>• Electronic devices are not allowed in the exam hall.</p>
          </div>

          <div className="flex justify-between pt-8 text-xs text-foreground/60">
            <span className="border-t border-border pt-1 px-4">Student's Signature</span>
            <span className="border-t border-border pt-1 px-4">Principal's Signature</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
