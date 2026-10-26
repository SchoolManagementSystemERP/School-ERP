import { BookOpen, Building2, Calendar, CalendarOff, ClipboardCheck, ClipboardList, FileText, LayoutDashboard, MessageSquare, School, Upload, UserCircle, Users } from "lucide-react";
import { teacherSubjects, useCurrentTeacher } from "@/store/session";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [{ name: "Dashboard", href: "/teacher", icon: LayoutDashboard }],
  },
  {
    label: "Classroom",
    items: [
      { name: "Attendance", href: "/teacher/attendance", icon: ClipboardCheck },
      { name: "Marks", href: "/teacher/marks", icon: FileText },
      { name: "Assignments", href: "/teacher/assignments", icon: BookOpen },
      { name: "Notes", href: "/teacher/notes", icon: Upload },
      { name: "Timetable", href: "/teacher/timetable", icon: Calendar },
    ],
  },
  {
    label: "People",
    items: [
      { name: "Students", href: "/teacher/students", icon: Users },
      { name: "Communication", href: "/teacher/communication", icon: MessageSquare },
    ],
  },
];

export function TeacherLayout() {
  const teacher = useCurrentTeacher();
  // extra pages for class teachers and heads of department, plus leave for everyone
  const mine: NavGroup = {
    label: "Me",
    items: [
      ...(teacher?.classTeacherOf ? [{ name: `My Class (${teacher.classTeacherOf})`, href: "/teacher/my-class", icon: School }] : []),
      ...(teacher?.positions.includes("Head of Department (HOD)") ? [{ name: "My Department", href: "/teacher/department", icon: Building2 }] : []),
      { name: "My Leave", href: "/teacher/leave", icon: CalendarOff },
      { name: "My HR", href: "/teacher/my-hr", icon: UserCircle },
      { name: "Requisitions", href: "/teacher/requisitions", icon: ClipboardList },
    ],
  };
  return (
    <AppShell
      portal="Teacher"
      home="/teacher"
      nav={[...nav, mine]}
      user={{
        name: teacher?.name ?? "Teacher",
        subtitle: `${teacherSubjects(teacher).join(", ") || teacher?.department || ""} Teacher`,
        initials: teacher?.initials ?? "T",
      }}
    />
  );
}
