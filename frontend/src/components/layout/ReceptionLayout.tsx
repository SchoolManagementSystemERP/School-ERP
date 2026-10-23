import { DoorOpen, GraduationCap, LayoutDashboard, PhoneCall, UserPlus } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  { items: [{ name: "Front Office", href: "/reception", icon: LayoutDashboard }] },
  {
    label: "Admissions",
    items: [
      { name: "Enquiries", href: "/reception/enquiries", icon: PhoneCall },
      { name: "New Admission", href: "/reception/admission", icon: UserPlus },
      { name: "Students", href: "/reception/students", icon: GraduationCap },
    ],
  },
  { label: "Gate", items: [{ name: "Visitor Log", href: "/reception/visitors", icon: DoorOpen }] },
];

export function ReceptionLayout() {
  return <AppShell portal="Reception" home="/reception" nav={nav} user={{ name: "Ms. Pooja Rani", subtitle: "Receptionist", initials: "PR" }} />;
}
