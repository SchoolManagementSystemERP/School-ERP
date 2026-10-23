import {
  Award, BookOpen, Calendar, ClipboardCheck, FileText, Gift, IndianRupee, LayoutDashboard, MessageSquare, Upload,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setCurrentStudentId, useCurrentStudent } from "@/store/session";
import { useStudents } from "@/store/students";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [{ name: "Overview", href: "/parent", icon: LayoutDashboard }],
  },
  {
    label: "My Child",
    items: [
      { name: "Marks & Results", href: "/parent/marks", icon: FileText },
      { name: "Attendance", href: "/parent/attendance", icon: ClipboardCheck },
      { name: "Assignments", href: "/parent/assignments", icon: BookOpen },
      { name: "Timetable", href: "/parent/timetable", icon: Calendar },
      { name: "Resources", href: "/parent/resources", icon: Upload },
      { name: "Admit Card", href: "/parent/admit-card", icon: Award },
    ],
  },
  {
    label: "School",
    items: [
      { name: "Fees", href: "/parent/fees", icon: IndianRupee },
      { name: "Holidays", href: "/parent/holidays", icon: Gift },
      { name: "Messages & Notices", href: "/parent/communication", icon: MessageSquare },
    ],
  },
];

/** Parent portal: the student pages, viewed for one of the parent's children. */
export function ParentLayout() {
  const child = useCurrentStudent();
  const { students } = useStudents();
  // siblings share the father's phone number
  const children = child?.fatherPhone ? students.filter((s) => s.fatherPhone === child.fatherPhone) : child ? [child] : [];
  const parentName = child?.fatherName || child?.motherName || "Parent";

  const switcher = children.length > 1 && child ? (
    <Select value={String(child.id)} onValueChange={(v) => setCurrentStudentId(Number(v))}>
      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {children.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.firstName} · {c.class}</SelectItem>)}
      </SelectContent>
    </Select>
  ) : child ? (
    <span className="hidden sm:inline rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
      {child.name} · {child.class}
    </span>
  ) : null;

  return (
    <AppShell
      portal="Parent"
      home="/parent"
      nav={nav}
      headerExtra={switcher}
      user={{
        name: parentName,
        subtitle: child ? `Parent of ${child.firstName || child.name}` : "Parent",
        initials: parentName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      }}
    />
  );
}
