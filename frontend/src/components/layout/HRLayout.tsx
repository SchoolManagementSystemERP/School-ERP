import { Briefcase, CalendarOff, Contact, LayoutDashboard, UserPlus, WalletCards } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  { items: [{ name: "Overview", href: "/hr", icon: LayoutDashboard }] },
  {
    label: "People",
    items: [
      { name: "Staff Directory", href: "/hr/staff", icon: Contact },
      { name: "Add Teacher", href: "/hr/setup/teachers", icon: UserPlus },
      { name: "Leave Requests", href: "/hr/leaves", icon: CalendarOff },
      { name: "Recruitment", href: "/hr/recruitment", icon: Briefcase },
    ],
  },
  { label: "Salary", items: [{ name: "Payroll", href: "/hr/payroll", icon: WalletCards }] },
];

export function HRLayout() {
  return <AppShell portal="HR" home="/hr" nav={nav} user={{ name: "Ms. Ritu Malhotra", subtitle: "HR Manager", initials: "RM" }} />;
}
