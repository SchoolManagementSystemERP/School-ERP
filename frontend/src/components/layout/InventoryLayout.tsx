import { Bell, BookOpen, Box, Building2, FileText, LayoutDashboard, Package, ShoppingCart, Tag, Users, Warehouse } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [
      { name: "Dashboard", href: "/inventory", icon: LayoutDashboard },
      { name: "All Items", href: "/inventory/items", icon: Package },
      { name: "Store & Purchase", href: "/inventory/purchase", icon: ShoppingCart },
      { name: "Categories", href: "/inventory/categories", icon: Box },
      { name: "Reports", href: "/inventory/reports", icon: FileText },
    ],
  },
];

const setup: NavGroup[] = [
  {
    label: "Configuration",
    items: [
      { name: "Warehouses", href: "/inventory/setup/warehouses", icon: Warehouse },
      { name: "Units & Measures", href: "/inventory/setup/units", icon: Tag },
      { name: "Item Categories", href: "/inventory/setup/item-categories", icon: Box },
    ],
  },
  {
    label: "Administration",
    items: [
      { name: "Users & Roles", href: "/inventory/setup/users", icon: Users },
      { name: "School Info", href: "/inventory/setup/school", icon: Building2 },
      { name: "Academic Years", href: "/inventory/setup/academic-years", icon: BookOpen },
      { name: "Notifications", href: "/inventory/setup/notifications", icon: Bell },
    ],
  },
];

export function InventoryLayout() {
  return (
    <AppShell
      portal="Inventory"
      home="/inventory"
      nav={nav}
      setup={setup}
      user={{ name: "Inventory Admin", subtitle: "Inventory Manager", initials: "IA" }}
    />
  );
}
