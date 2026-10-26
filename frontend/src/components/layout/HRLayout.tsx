import {
  Briefcase, Calculator, CalendarCheck, CalendarOff, ClipboardCheck, Contact, DoorOpen, FileSignature, GraduationCap, Landmark, LayoutDashboard, Receipt, Settings,
  UserCircle, UserPlus, WalletCards,
} from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  { items: [{ name: "Overview", href: "/hr", icon: LayoutDashboard }] },
  {
    label: "People",
    items: [
      { name: "Staff Directory", href: "/hr/staff", icon: Contact },
      { name: "Add Teacher", href: "/hr/setup/teachers", icon: UserPlus },
      { name: "Staff Attendance", href: "/hr/attendance", icon: CalendarCheck },
      { name: "Leave Requests", href: "/hr/leaves", icon: CalendarOff },
    ],
  },
  {
    label: "Hiring",
    items: [
      { name: "Recruitment", href: "/hr/recruitment", icon: Briefcase },
      { name: "Offer Letters", href: "/hr/offers", icon: FileSignature },
      { name: "Onboarding", href: "/hr/onboarding", icon: ClipboardCheck },
    ],
  },
  { label: "Learning", items: [{ name: "Training & MIS", href: "/hr/trainings", icon: GraduationCap }] },
  {
    label: "Salary",
    items: [
      { name: "Compensation", href: "/hr/compensation", icon: Calculator },
      { name: "Payroll", href: "/hr/payroll", icon: WalletCards },
      { name: "Expense Claims", href: "/hr/claims", icon: Receipt },
      { name: "Statutory Compliance", href: "/hr/compliance", icon: Landmark },
    ],
  },
  {
    label: "Exit & settings",
    items: [
      { name: "Exits & F&F", href: "/hr/exits", icon: DoorOpen },
      { name: "HR Settings", href: "/hr/settings", icon: Settings },
      { name: "My HR", href: "/hr/my-hr", icon: UserCircle },
    ],
  },
];

export function HRLayout() {
  return <AppShell portal="HR" home="/hr" nav={nav} user={{ name: "Ms. Ritu Malhotra", subtitle: "HR Manager", initials: "RM" }} />;
}
