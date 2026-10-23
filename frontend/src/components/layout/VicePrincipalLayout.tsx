import {
  BarChart3, BookOpen, Calendar, ClipboardCheck, FileText, GraduationCap, Group, GroupIcon, HeartHandshake,
  LayoutDashboard, Library, MessageSquare, Upload, UsersRound,
} from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

/** Vice principal: academics and people, without finance, inventory or school setup. */
const nav: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/vice-principal", icon: LayoutDashboard },
      { name: "Reports & Analytics", href: "/vice-principal/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Students",
    items: [
      { name: "Manage Students", href: "/vice-principal/students", icon: GroupIcon },
      { name: "Attendance", href: "/vice-principal/attendance", icon: ClipboardCheck },
      { name: "Marks", href: "/vice-principal/marks", icon: FileText },
      { name: "Assignments", href: "/vice-principal/assignments", icon: BookOpen },
      { name: "Timetable", href: "/vice-principal/timetable", icon: Calendar },
      { name: "Notes", href: "/vice-principal/notes", icon: Upload },
    ],
  },
  {
    label: "Staff & School",
    items: [
      { name: "Manage Teachers", href: "/vice-principal/teachers", icon: Group },
      { name: "Library", href: "/vice-principal/library", icon: Library },
      { name: "Communication", href: "/vice-principal/communication", icon: MessageSquare },
    ],
  },
];

const setup: NavGroup[] = [
  {
    label: "People",
    items: [
      { name: "Student Setup", href: "/vice-principal/setup/students", icon: GraduationCap },
      { name: "Teacher Setup", href: "/vice-principal/setup/teachers", icon: UsersRound },
      { name: "Parent Setup", href: "/vice-principal/setup/parents", icon: HeartHandshake },
    ],
  },
];

export function VicePrincipalLayout() {
  return (
    <AppShell
      portal="Vice Principal"
      home="/vice-principal"
      nav={nav}
      setup={setup}
      user={{ name: "Mr. Anil Mehra", subtitle: "Vice Principal", initials: "AM" }}
    />
  );
}
