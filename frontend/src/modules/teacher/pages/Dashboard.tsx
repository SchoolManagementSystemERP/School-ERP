import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, ClipboardCheck, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { daysUntil } from "@/lib/dates";
import { teacherPeriods } from "@/lib/schedule";
import { useAssignments } from "@/store/assignments";
import { useAttendanceRecords } from "@/store/attendance";
import { useAnnouncements } from "@/store/communication";
import { useNotes } from "@/store/notes";
import { teacherClasses, useCurrentTeacher } from "@/store/session";
import { useClassRoster } from "@/store/students";
import { StatCard, toneFrom } from "@/components/common/StatCard";

export function Dashboard() {
  const teacher = useCurrentTeacher();
  const { classes: allClasses, byClass } = useClassRoster();
  const myClasses = teacherClasses(teacher, allClasses);
  const periods = teacherPeriods(teacher?.name);
  const assignments = useAssignments().filter((x) => x.teacher === teacher?.name);
  const notes = useNotes().filter((n) => n.uploadedBy === teacher?.name);
  const announcements = useAnnouncements().filter((x) => x.from === teacher?.name);
  const records = useAttendanceRecords();

  const studentCount = myClasses.reduce((n, c) => n + (byClass[c]?.length ?? 0), 0);
  const toGrade = assignments.reduce((n, x) => n + x.submissions.filter((sub) => sub.marksObtained === undefined).length, 0);
  // attendance across my classes
  let present = 0, total = 0;
  for (const r of records) {
    if (!myClasses.includes(`Class ${r.className}`)) continue;
    for (const p of r.periods) for (const e of p.entries) { total++; if (e.status === "present") present++; }
  }
  const isWeekday = new Date().getDay() >= 1 && new Date().getDay() <= 5;

  const stats = [
    { title: "My Students", value: String(studentCount), icon: Users, color: "bg-blue-500", href: "/teacher/students" },
    { title: "Classes Today", value: String(isWeekday ? periods.length : 0), icon: Calendar, color: "bg-green-500", href: "/teacher/timetable" },
    { title: "Submissions to Grade", value: String(toGrade), icon: BookOpen, color: "bg-orange-500", href: "/teacher/assignments" },
    { title: "Attendance Rate", value: total ? `${Math.round((present / total) * 100)}%` : "—", icon: ClipboardCheck, color: "bg-purple-500", href: "/teacher/attendance" },
  ];

  const upcomingClasses = (isWeekday ? periods : []).map((p) => ({ class: p.class, subject: p.subject, time: p.time, room: p.room }));

  const recentActivities = [
    ...assignments.map((x) => ({ action: `Created assignment "${x.title}" for ${x.class}`, date: x.assignedDate })),
    ...notes.map((n) => ({ action: `Uploaded notes "${n.title}" for ${n.class}`, date: n.uploadDate })),
    ...announcements.map((x) => ({ action: `Sent announcement "${x.title}"`, date: x.date })),
  ]
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, 5)
    .map((x) => ({ action: x.action, time: daysUntil(x.date) === 0 ? "Today" : `${-daysUntil(x.date)} day${daysUntil(x.date) === -1 ? "" : "s"} ago` }));
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back, {teacher?.name ?? "Teacher"}! Here&apos;s your overview for today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} label={stat.title} value={stat.value} icon={stat.icon} tone={toneFrom(stat.color)} href={stat.href} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingClasses.length === 0 && <p className="text-sm text-muted-foreground">No classes today.</p>}
              {upcomingClasses.map((classItem, index) => (
                <div key={index} className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="bg-blue-50 dark:bg-blue-500/10 p-2 rounded-lg">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{classItem.class}</p>
                    <p className="text-sm text-muted-foreground">{classItem.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">{classItem.time} • {classItem.room}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link to="/teacher/timetable">View Full Timetable</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.length === 0 && <p className="text-sm text-muted-foreground">No recent activity.</p>}
              {recentActivities.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{activity.action}</p>
                    <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link to="/teacher/attendance">
                <ClipboardCheck className="h-6 w-6" />
                <span className="text-sm">Mark Attendance</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link to="/teacher/marks">
                <BookOpen className="h-6 w-6" />
                <span className="text-sm">Upload Marks</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link to="/teacher/notes">
                <Users className="h-6 w-6" />
                <span className="text-sm">Upload Notes</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link to="/teacher/assignments">
                <Calendar className="h-6 w-6" />
                <span className="text-sm">New Assignment</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
