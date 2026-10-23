import { BedDouble, DoorOpen, LayoutDashboard } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [
      { name: "Overview", href: "/hostel", icon: LayoutDashboard },
      { name: "Rooms & Residents", href: "/hostel/rooms", icon: BedDouble },
      { name: "Outpasses", href: "/hostel/outpass", icon: DoorOpen },
    ],
  },
];

export function HostelLayout() {
  return <AppShell portal="Hostel" home="/hostel" nav={nav} user={{ name: "Mrs. Lata Devi", subtitle: "Hostel Warden", initials: "LD" }} />;
}
