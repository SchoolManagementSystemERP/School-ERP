import { BarChart3, FileInput, FileSpreadsheet, LayoutDashboard, Receipt, Wallet, WalletCards } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  { items: [{ name: "Overview", href: "/accountant", icon: LayoutDashboard }] },
  {
    label: "Fees",
    items: [
      { name: "Fee Collection", href: "/accountant/fees", icon: Wallet },
      { name: "Fee Structure", href: "/accountant/fee-structure", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Spending",
    items: [
      { name: "Expenses", href: "/accountant/expenses", icon: Receipt },
      { name: "Vendor Bills", href: "/accountant/payables", icon: FileInput },
      { name: "Payroll", href: "/accountant/payroll", icon: WalletCards },
      { name: "Reports", href: "/accountant/reports", icon: BarChart3 },
    ],
  },
];

export function AccountantLayout() {
  return <AppShell portal="Accounts" home="/accountant" nav={nav} user={{ name: "Mr. Sunil Agarwal", subtitle: "Accountant", initials: "SA" }} />;
}
