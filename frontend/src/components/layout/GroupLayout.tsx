import { LayoutDashboard, Stamp } from "lucide-react";
import { authStore, can } from "@/store/auth";
import { AppShell, type NavGroup, type NavItem } from "./AppShell";

/** The group office: chairman, trust, group heads, regional and cluster heads. Menu follows their permissions. */
export function GroupLayout() {
  const { me } = authStore.useValue();
  const items: NavItem[] = [
    { name: "Group Dashboard", href: "/group", icon: LayoutDashboard },
    ...(can("procurement.approve_management") ? [{ name: "Purchase Approvals", href: "/group/purchase-approvals", icon: Stamp }] : []),
  ];
  const nav: NavGroup[] = [{ items }];
  const roleName = me?.memberships.find((m) => m.scopeType === "ORG" || m.scopeType === "REGION")?.role.name ?? "Group Office";
  return <AppShell portal="Group Office" home="/group" nav={nav} user={{ name: me?.user.name ?? "Group Office", subtitle: roleName, initials: "GO" }} />;
}
