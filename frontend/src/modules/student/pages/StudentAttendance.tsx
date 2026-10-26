import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { ClipboardCheck, CheckCircle, XCircle, AlertCircle, TrendingUp, Eye } from "lucide-react";
import { shortClassName } from "@/data/classes";
import { attendanceOnDate, attendanceTotals, subjectAttendance } from "@/lib/studentStats";
import { useAttendanceRecords } from "@/store/attendance";
import { MiniStats } from "@/components/common/MiniStats";
import { useCurrentStudent } from "@/store/session";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Local YYYY-MM-DD (matches how attendance dates are stored). */
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function StudentAttendance() {
  const student = useCurrentStudent();
  const records = useAttendanceRecords();
  const className = student ? shortClassName(student.class) : "";
  const classRecords = records.filter((r) => r.className === className);

  // Months that have attendance for this class, newest first.
  const months = [...new Set(classRecords.map((r) => r.date.slice(0, 7)))].sort().reverse().map((ym) => {
    const [year, month] = ym.split("-").map(Number);
    return { value: ym, label: `${MONTH_NAMES[month - 1]} ${year}`, month: month - 1, year };
  });
  const latestDate = classRecords.map((r) => r.date).sort().at(-1);

  const [selectedMonthYear, setSelectedMonthYear] = useState(months[0]?.value ?? "");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(latestDate ? new Date(`${latestDate}T00:00:00`) : new Date());

  const allRows = student ? subjectAttendance(records, className, student.id) : [];
  const subjects = [{ value: "all", label: "All Subjects" }, ...allRows.map((r) => ({ value: r.subject, label: r.subject }))];
  const subjectAttendanceRows = selectedSubject === "all" ? allRows : allRows.filter((r) => r.subject === selectedSubject);
  const overallStats = attendanceTotals(subjectAttendanceRows);
  const percentageLabel = overallStats.total ? Number(overallStats.percentage.toFixed(1)) : 0;

  const now = new Date();
  const currentMonthData = months.find(m => m.value === selectedMonthYear) ?? { month: now.getMonth(), year: now.getFullYear() };

  // Jump the calendar when a different month is picked
  useEffect(() => {
    const m = months.find((x) => x.value === selectedMonthYear);
    if (m && (selectedDate?.getMonth() !== m.month || selectedDate?.getFullYear() !== m.year)) {
      setSelectedDate(new Date(m.year, m.month, 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonthYear]);

  const selectedDateDetails = student && selectedDate
    ? attendanceOnDate(records, className, student.id, toDateKey(selectedDate))
        .filter((d) => selectedSubject === "all" || d.subject === selectedSubject)
    : [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "present": return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "absent": return <XCircle className="h-5 w-5 text-red-500" />;
      case "leave": return <AlertCircle className="h-5 w-5 text-amber-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">At least 75% attendance is needed to sit the exams. Tap a date in the calendar to see that day.</p>
        </div>
      </div>

      {/* Overall Stats */}
      <MiniStats items={[
        { label: "Attendance", value: `${percentageLabel}%`, icon: TrendingUp, tone: Number(percentageLabel) >= 75 ? "green" : "red" },
        { label: "Present", value: overallStats.present, icon: CheckCircle, tone: "green" },
        { label: "Absent", value: overallStats.absent, icon: XCircle, tone: "red" },
        { label: "Periods held", value: overallStats.total, icon: ClipboardCheck, tone: "blue" },
      ]} />

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Select Month & Year</label>
              <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Filter by Subject</label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Subject-wise Performance */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Subject-wise Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {subjectAttendanceRows.length === 0 && <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>}
            {subjectAttendanceRows.map((sub, idx) => (
              <div key={idx} className="group">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-lg">{sub.subject}</h3>
                  <Badge className={sub.percentage >= 90 ? "bg-green-600" : "bg-blue-600"}>
                    {sub.percentage.toFixed(1)}%
                  </Badge>
                </div>
                <Progress value={sub.percentage} className="h-3" />
                <div className="flex justify-between mt-3 text-sm">
                  <span>{sub.present}/{sub.total} periods{sub.leave ? ` · ${sub.leave} leave` : ""}</span>
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4 text-green-500" />{sub.present}</span>
                    <span className="flex items-center gap-1"><XCircle className="h-4 w-4 text-red-500" />{sub.absent}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Calendar</CardTitle>
            <p className="text-sm text-muted-foreground">Click any date to view detailed attendance</p>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              month={new Date(currentMonthData.year, currentMonthData.month)}
              className="rounded-xl border shadow-sm"
            />
          </CardContent>
        </Card>
      </div>

      {/* Selected Date Details */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Attendance on {selectedDate.toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {selectedDateDetails.length === 0 && <p className="text-sm text-muted-foreground">No attendance recorded for this date.</p>}
              {selectedDateDetails.map((record, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                  <div className="flex items-center gap-4">
                    {getStatusIcon(record.status)}
                    <div>
                      <p className="font-medium">{record.subject}</p>
                      <p className="text-xs text-muted-foreground">{record.time}</p>
                    </div>
                  </div>
                  <Badge variant={record.status === "present" ? "default" : "secondary"}>
                    {record.status.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}