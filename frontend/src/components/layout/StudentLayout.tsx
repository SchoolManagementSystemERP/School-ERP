import {
  Award, BookOpen, Calendar, ClipboardCheck, FileText, Gift, Home, IndianRupee, LayoutDashboard, MessageSquare, NotebookText,
} from "lucide-react";
import { useCurrentStudent } from "@/store/session";
import { AppShell, type NavGroup, type NavItem } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [{ name: "Dashboard", href: "/student", icon: LayoutDashboard }],
  },
  {
    label: "Academics",
    items: [
      { name: "Marks & Results", href: "/student/marks", icon: FileText },
      { name: "Homework", href: "/student/assignments", icon: BookOpen },
      { name: "Attendance", href: "/student/attendance", icon: ClipboardCheck },
      { name: "Timetable", href: "/student/timetable", icon: Calendar },
      { name: "Study Notes", href: "/student/resources", icon: NotebookText },
      { name: "Admit Card", href: "/student/admit-card", icon: Award },
    ],
  },
  {
    label: "School",
    items: [
      { name: "Fees", href: "/student/fees", icon: IndianRupee },
      { name: "Holidays", href: "/student/holidays", icon: Gift },
      { name: "Messages & Notices", href: "/student/communication", icon: MessageSquare },
    ],
  },
];

/** Tab bar on phones: what a student opens most. */
const bottomNav: NavItem[] = [
  { name: "Home", href: "/student", icon: Home },
  { name: "Timetable", href: "/student/timetable", icon: Calendar },
  { name: "Homework", href: "/student/assignments", icon: BookOpen },
  { name: "Results", href: "/student/marks", icon: FileText },
];

export function StudentLayout() {
  const student = useCurrentStudent();
  return (
    <AppShell
      portal="Student"
      home="/student"
      nav={nav}
      bottomNav={bottomNav}
      user={{
        name: student?.name ?? "Student",
        subtitle: student ? `${student.class} · Roll ${student.rollNo}` : "",
        initials: student?.initials ?? "ST",
      }}
    />
  );
}
