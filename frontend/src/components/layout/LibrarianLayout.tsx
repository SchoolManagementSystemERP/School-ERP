import { BookOpen, FileText, LayoutDashboard, Users } from "lucide-react";
import { AppShell, type NavGroup } from "./AppShell";

const nav: NavGroup[] = [
  {
    items: [
      { name: "Dashboard", href: "/librarian", icon: LayoutDashboard },
      { name: "Books Catalog", href: "/librarian/books", icon: BookOpen },
      { name: "Issue & Return", href: "/librarian/issue-return", icon: FileText },
      { name: "Members", href: "/librarian/members", icon: Users },
    ],
  },
];

export function LibrarianLayout() {
  return (
    <AppShell
      portal="Library"
      home="/librarian"
      nav={nav}
      user={{ name: "Library Admin", subtitle: "Librarian", initials: "LA" }}
    />
  );
}
