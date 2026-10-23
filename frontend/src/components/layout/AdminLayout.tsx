import { Globe, KeyRound, LayoutDashboard, Server, ShieldCheck, Stamp } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [
      { name: "Overview", href: "/admin", icon: LayoutDashboard },
      { name: "Users & Access", href: "/admin/users", icon: KeyRound },
      { name: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck },
      { name: "School Website", href: "/admin/website", icon: Globe },
      { name: "Purchase Approvals", href: "/admin/purchase-approvals", icon: Stamp },
      { name: "System", href: "/admin/system", icon: Server },
    ],
  },
];

export function AdminLayout() {
  return <AppShell portal="Admin" home="/admin" nav={nav} user={{ name: "System Admin", subtitle: "Super Admin", initials: "SA" }} />;
}
