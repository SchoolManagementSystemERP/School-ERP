import { Bus, LayoutDashboard, MapPin, Users } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [
      { name: "Overview", href: "/transport", icon: LayoutDashboard },
      { name: "Routes", href: "/transport/routes", icon: MapPin },
      { name: "Vehicles", href: "/transport/vehicles", icon: Bus },
      { name: "Student Allocation", href: "/transport/allocation", icon: Users },
    ],
  },
];

export function TransportLayout() {
  return <AppShell portal="Transport" home="/transport" nav={nav} user={{ name: "Mr. Vinod Tiwari", subtitle: "Transport Manager", initials: "VT" }} />;
}
