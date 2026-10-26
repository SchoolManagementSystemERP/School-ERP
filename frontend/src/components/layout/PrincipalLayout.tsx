import {
  BarChart3, BookOpen, Boxes, Building2, BuildingIcon, Calendar, ClipboardCheck, FileText, GraduationCap,
  Group, GroupIcon, HeartHandshake, LayoutDashboard, Library, MessageSquare, Package, Receipt, Stamp, Upload, UsersRound, Wallet,
} from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/principal", icon: LayoutDashboard },
      { name: "Reports & Analytics", href: "/principal/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Students",
    items: [
      { name: "Manage Students", href: "/principal/students", icon: GroupIcon },
      { name: "Attendance", href: "/principal/attendance", icon: ClipboardCheck },
      { name: "Marks", href: "/principal/marks", icon: FileText },
      { name: "Assignments", href: "/principal/assignments", icon: BookOpen },
      { name: "Timetable", href: "/principal/timetable", icon: Calendar },
      { name: "Notes", href: "/principal/notes", icon: Upload },
    ],
  },
  {
    label: "Staff",
    items: [{ name: "Manage Teachers", href: "/principal/teachers", icon: Group }],
  },
  {
    label: "Administration",
    items: [
      { name: "Finance", href: "/principal/finance", icon: Wallet },
      { name: "Purchase Approvals", href: "/principal/purchase-approvals", icon: Stamp },
      { name: "Expense Claims", href: "/principal/claims", icon: Receipt },
      { name: "Inventory", href: "/principal/inventory", icon: Package },
      { name: "Library", href: "/principal/library", icon: Library },
      { name: "Communication", href: "/principal/communication", icon: MessageSquare },
    ],
  },
];

const setup: NavGroup[] = [
  {
    label: "School",
    items: [
      { name: "Academic Year", href: "/principal/setup/academic-year", icon: Calendar },
      { name: "Class Setup", href: "/principal/setup/classes", icon: BuildingIcon },
      { name: "Section Setup", href: "/principal/setup/sections", icon: Building2 },
    ],
  },
  {
    label: "People",
    items: [
      { name: "Student Setup", href: "/principal/setup/students", icon: GraduationCap },
      { name: "Teacher Setup", href: "/principal/setup/teachers", icon: UsersRound },
      { name: "Parent Setup", href: "/principal/setup/parents", icon: HeartHandshake },
    ],
  },
  {
    label: "Assets",
    items: [{ name: "Inventory Setup", href: "/principal/setup/inventory", icon: Boxes }],
  },
];

export function PrincipalLayout() {
  return (
    <AppShell
      portal="Principal"
      home="/principal"
      nav={nav}
      setup={setup}
      user={{ name: "Principal", subtitle: "Principal", initials: "PR" }}
    />
  );
}
