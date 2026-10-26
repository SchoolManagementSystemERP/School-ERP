import { Link } from "react-router";
import {
  AlertTriangle, Award, Bell, BookOpen, CalendarClock, CheckCircle2, ClipboardCheck, Clock, FileText, IndianRupee,
  MessageSquare, PartyPopper, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import { parseClassName, shortClassName } from "@/data/classes";
import { daysUntil, today } from "@/lib/dates";
import { fmtDay, fmtWeekday, greeting, minutesOf, relativeDay, rupees } from "@/lib/format";
import { useSectionBase } from "@/lib/section";
import { attendanceTotals, examHistory, rankInClass, subjectAttendance } from "@/lib/studentStats";
import { studentAssignmentStatus, useAssignments } from "@/store/assignments";
import { useAttendanceRecords } from "@/store/attendance";
import { isVisibleTo, messagesFor, useAnnouncements, useMessages } from "@/store/communication";
import { examStatus, nextExamFor, usePublishedExamNames, useExams } from "@/store/exams";
import { feeAccount, useFeePayments } from "@/store/fees";
import { useMarks } from "@/store/marks";
import { useCurrentStudent } from "@/store/session";
import { useClassRoster } from "@/store/students";
import { useWeeklyTimetable, type PlannedPeriod } from "@/store/timetable";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dowOf = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/** Today's periods, or the next school day's when there are none today. */
function scheduleFor(days: Record<number, PlannedPeriod[]>) {
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const periods = days[dowOf(d)] ?? [];
    if (periods.length) return { offset: i, dayName: DAY_NAMES[dowOf(d)], periods };
  }
  return { offset: 0, dayName: "", periods: [] as PlannedPeriod[] };
}

type Todo = { key: string; icon: typeof BookOpen; tone: "red" | "amber" | "blue" | "violet"; title: string; detail: string; href: string; action?: string };

const TONE: Record<Todo["tone"], string> = {
  red: "bg-red-500/10 text-red-600 dark:text-red-300",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
};

export function StudentDashboard() {
  const base = useSectionBase();
  const isParent = base === "/parent";
  const student = useCurrentStudent();
  const marks = useMarks();
  const records = useAttendanceRecords();
  const { byClass } = useClassRoster();
  const allAssignments = useAssignments();
  const published = usePublishedExamNames();
  const exams = useExams();
  const payments = useFeePayments();
  const announcements = useAnnouncements();
  const messages = useMessages();
  const weekly = useWeeklyTimetable();
  if (!student) return null;

  const firstName = student.firstName || student.name.split(" ")[0];

  // ── Today ──
  const schedule = scheduleFor(weekly[shortClassName(student.class)] ?? {});
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const slot = (p: PlannedPeriod) => p.timeSlot.split("–").map((t) => minutesOf(t.trim()));
  const current = schedule.offset === 0 ? schedule.periods.find((p) => { const [s, e] = slot(p); return nowMin >= s && nowMin < e; }) : undefined;
  const next = schedule.offset === 0 ? schedule.periods.find((p) => slot(p)[0] > nowMin) : schedule.periods[0];
  const dayOver = schedule.offset === 0 && schedule.periods.length > 0 && !current && !next;

  // ── Things to do ──
  const myAssignments = allAssignments.filter((a) => a.class === student.class).map((a) => ({ ...a, status: studentAssignmentStatus(a, student.id) }));
  const toSubmit = myAssignments.filter((a) => a.status === "pending" || a.status === "overdue").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const account = feeAccount(student, payments);
  const feeDue = account.nextDue;
  const grade = parseClassName(student.class).grade;
  const nextExam = nextExamFor(exams, grade);
  const examStarts = nextExam?.papers[0]?.date;
  const me = isParent ? { role: "parent" as const, id: student.id } : { role: "student" as const, id: student.id };
  const unread = messagesFor(messages, me).inbox.filter((m) => !m.read).length;

  const todos: Todo[] = [
    ...toSubmit.slice(0, 3).map((a): Todo => ({
      key: `a${a.id}`, icon: BookOpen, tone: a.status === "overdue" ? "red" : daysUntil(a.dueDate) <= 2 ? "amber" : "blue",
      title: a.title, detail: `${a.subject} · ${a.status === "overdue" ? `was due ${relativeDay(a.dueDate)}` : `due ${relativeDay(a.dueDate)}`}`,
      href: `${base}/assignments`, action: isParent ? undefined : "Submit",
    })),
    ...(feeDue && (feeDue.status === "overdue" || daysUntil(feeDue.dueDate) <= 30)
      ? [{
          key: "fee", icon: IndianRupee, tone: feeDue.status === "overdue" ? "red" : "amber", title: `${feeDue.name}: ${rupees(feeDue.amount + feeDue.lateFee)}`,
          detail: feeDue.status === "overdue" ? `Overdue since ${fmtDay(feeDue.dueDate)}${feeDue.lateFee ? ` · includes ${rupees(feeDue.lateFee)} late fee` : ""}` : `Due ${relativeDay(feeDue.dueDate)} (${fmtDay(feeDue.dueDate)})`,
          href: `${base}/fees`, action: "Pay",
        } satisfies Todo]
      : []),
    ...(nextExam && examStarts && daysUntil(examStarts) <= 21
      ? [{
          key: "exam", icon: FileText, tone: "violet", title: `${nextExam.name} ${examStatus(nextExam) === "Ongoing" ? "is on" : `starts ${relativeDay(examStarts)}`}`,
          detail: `${nextExam.papers.length} papers from ${fmtWeekday(examStarts)} · admit card ready`, href: `${base}/admit-card`, action: "Admit card",
        } satisfies Todo]
      : []),
    ...(unread
      ? [{ key: "msg", icon: MessageSquare, tone: "blue", title: `${unread} unread message${unread > 1 ? "s" : ""}`, detail: "From your teachers", href: `${base}/communication`, action: "Read" } satisfies Todo]
      : []),
  ];

  // ── Progress ──
  const history = examHistory(marks, student.class, student.id).filter((r) => published.has(r.exam));
  const latest = history.at(-1);
  const previous = history.at(-2);
  const change = latest && previous ? latest.percentage - previous.percentage : null;
  const classmates = (byClass[student.class] ?? []).map((s) => s.id);
  const rank = latest ? rankInClass(marks, student.class, latest.exam, classmates, student.id) : null;
  const attendanceRows = subjectAttendance(records, shortClassName(student.class), student.id);
  const attendance = attendanceTotals(attendanceRows);
  const lowSubjects = attendanceRows.filter((r) => r.total && r.percentage < 75);

  const notices = announcements.filter((a) => isVisibleTo(a, { role: "student", cls: student.class })).slice(0, 3);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Greeting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            {isParent ? `${firstName}'s day` : `${greeting()}, ${firstName}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {student.class} · Roll {student.rollNo} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        {rank && (
          <Link to={`${base}/marks`} className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <Award className="h-4 w-4" /> Rank {rank.rank} of {rank.outOf} · {latest!.exam}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5 lg:gap-6">
        {/* Today */}
        <Card className="gap-0 lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-primary" />
              {schedule.offset === 0 ? "Today's classes" : `No school today — ${schedule.dayName}'s classes`}
            </CardTitle>
            <Link to={`${base}/timetable`} className="shrink-0 text-xs font-medium text-primary hover:underline">Full week</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {schedule.periods.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No timetable set for your class yet.</p>}
            {dayOver && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">Classes are over for today. Well done!</p>}
            {schedule.periods.map((p) => {
              const isNow = p === current;
              const isNext = p === next && !current;
              const past = schedule.offset === 0 && slot(p)[1] <= nowMin;
              return (
                <div
                  key={p.periodNo}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                    isNow ? "border-primary bg-primary/5" : isNext ? "border-primary/40" : "border-border",
                    past && "opacity-55",
                  )}
                >
                  <div className="w-[88px] shrink-0 text-xs tabular-nums text-muted-foreground">{p.timeSlot.replace("–", " – ")}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.subjectName}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.teacherName}</p>
                  </div>
                  {isNow && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Now</span>}
                  {isNext && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Next</span>}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* To do — first on phones */}
        <Card className="order-first gap-0 lg:order-none lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-5 w-5 text-amber-600" /> Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todos.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <PartyPopper className="h-8 w-8 text-emerald-500" />
                <p className="font-medium text-foreground">All caught up</p>
                <p className="text-sm text-muted-foreground">No homework, fees or messages waiting.</p>
              </div>
            )}
            {todos.map((t) => (
              <Link key={t.key} to={t.href} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-accent">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE[t.tone])}><t.icon className="h-[18px] w-[18px]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                  <p className={cn("truncate text-xs", t.tone === "red" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{t.detail}</p>
                </div>
                {t.action && <span className="shrink-0 text-xs font-semibold text-primary">{t.action}</span>}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Glance href={`${base}/attendance`} icon={ClipboardCheck} tone="blue" label="Attendance" value={attendance.total ? `${Math.round(attendance.percentage)}%` : "—"}
          hint={!attendance.total ? "Not recorded yet" : attendance.percentage >= 75 ? `${attendance.present} of ${attendance.total} periods` : "Below 75%"} warn={!!attendance.total && attendance.percentage < 75} />
        <Glance href={`${base}/marks`} icon={TrendingUp} tone="green" label={latest ? latest.exam : "Last exam"} value={latest ? `${latest.percentage.toFixed(1)}%` : "—"}
          hint={change === null ? (latest ? `Grade ${latest.grade}` : "No results yet") : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}% vs ${previous!.exam}`} warn={change !== null && change < 0} />
        <Glance href={`${base}/assignments`} icon={BookOpen} tone="amber" label="Homework due" value={String(toSubmit.length)}
          hint={toSubmit.some((a) => a.status === "overdue") ? `${toSubmit.filter((a) => a.status === "overdue").length} overdue` : toSubmit.length ? `Next due ${fmtDay(toSubmit[0].dueDate)}` : "Nothing pending"} warn={toSubmit.some((a) => a.status === "overdue")} />
        <Glance href={`${base}/fees`} icon={IndianRupee} tone="violet" label="Fees pending" value={rupees(account.pending)}
          hint={account.pending === 0 ? "All paid" : feeDue ? `Next: ${fmtDay(feeDue.dueDate)}` : ""} warn={account.status === "Overdue"} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        {/* Latest results */}
        <Card className="gap-0">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5 text-blue-600" /> {latest ? `${latest.exam} results` : "Results"}</CardTitle>
            <Link to={`${base}/marks`} className="text-xs font-medium text-primary hover:underline">All results</Link>
          </CardHeader>
          <CardContent>
            {!latest && <p className="py-6 text-center text-sm text-muted-foreground">Results appear here once the school publishes them.</p>}
            <div className="space-y-3">
              {latest?.subjects.map((s) => (
                <div key={s.subject} className="flex items-center gap-3">
                  <p className="w-28 shrink-0 truncate text-sm text-foreground sm:w-36">{s.subject}</p>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", s.percentage >= 75 ? "bg-emerald-500" : s.percentage >= 50 ? "bg-primary" : "bg-amber-500")} style={{ width: `${Math.min(100, s.percentage)}%` }} />
                  </div>
                  <p className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{s.marks}<span className="text-xs font-normal text-muted-foreground">/{s.max}</span></p>
                  <span className="w-7 shrink-0 text-right text-xs font-semibold text-muted-foreground">{s.grade}</span>
                </div>
              ))}
            </div>
            {lowSubjects.length > 0 && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Attendance below 75% in {lowSubjects.map((r) => r.subject).join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Notices */}
        <Card className="gap-0">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-5 w-5 text-violet-600" /> Notices</CardTitle>
            <Link to={`${base}/communication`} className="text-xs font-medium text-primary hover:underline">All notices</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {notices.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No notices right now.</p>}
            {notices.map((n) => (
              <Link key={n.id} to={`${base}/communication`} className="block rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-accent">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.priority === "high" && <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-300">Important</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.content}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{n.from} · {fmtDay(n.date)}{n.date === today() ? " (today)" : ""}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {toSubmit.length === 0 && myAssignments.length > 0 && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> All homework submitted</p>
      )}
    </div>
  );
}

function Glance({ href, icon: Icon, tone, label, value, hint, warn }: { href: string; icon: typeof Clock; tone: "blue" | "green" | "amber" | "violet"; label: string; value: string; hint: string; warn?: boolean }) {
  const toneClass = { blue: TONE.blue, green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", amber: TONE.amber, violet: TONE.violet }[tone];
  return (
    <Link to={href} className="block">
      <Card className="h-full gap-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", toneClass)}><Icon className="h-4 w-4" /></div>
          </div>
          <p className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{value}</p>
          <p className={cn("mt-1 truncate text-[11px] sm:text-xs", warn ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            {hint}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

