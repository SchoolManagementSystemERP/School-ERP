import {
  Award, BookOpen, Calendar, ClipboardCheck, FileText, Gift, IndianRupee, LayoutDashboard, MessageSquare, Upload,
} from "lucide-react";
import { useCurrentStudent } from "@/store/session";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [{ name: "Dashboard", href: "/student", icon: LayoutDashboard }],
  },
  {
    label: "Academics",
    items: [
      { name: "Marks & Results", href: "/student/marks", icon: FileText },
      { name: "Assignments", href: "/student/assignments", icon: BookOpen },
      { name: "Attendance", href: "/student/attendance", icon: ClipboardCheck },
      { name: "Timetable", href: "/student/timetable", icon: Calendar },
      { name: "Resources", href: "/student/resources", icon: Upload },
      { name: "Admit Card", href: "/student/admit-card", icon: Award },
    ],
  },
  {
    label: "School",
    items: [
      { name: "Fees", href: "/student/fees", icon: IndianRupee },
      { name: "Holidays", href: "/student/holidays", icon: Gift },
      { name: "Communication", href: "/student/communication", icon: MessageSquare },
    ],
  },
];

export function StudentLayout() {
  const student = useCurrentStudent();
  return (
    <AppShell
      portal="Student"
      home="/student"
      nav={nav}
      user={{
        name: student?.name ?? "Student",
        subtitle: student ? `${student.class} · Roll ${student.rollNo}` : "",
        initials: student?.initials ?? "ST",
      }}
    />
  );
}
