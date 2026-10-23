import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { ChevronDown, GraduationCap, LogOut, Menu, Settings, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { cn } from "@/components/ui/utils";
import { clearAllStores } from "@/store/remote";
import { authStore, logout } from "@/store/session";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

interface AppShellProps {
  /** Shown under the brand name, e.g. "Principal". */
  portal: string;
  /** Section root, e.g. "/principal" — only matches exactly. */
  home: string;
  nav: NavGroup[];
  user: { name: string; subtitle: string; initials: string };
  /** Optional "Setup" menu in the top bar. */
  setup?: NavGroup[];
  /** Extra controls in the top bar (e.g. a child switcher). */
  headerExtra?: React.ReactNode;
}

/** Shared app frame for every role: sidebar, top bar and page area. */
export function AppShell({ portal, home, nav, user: shown, setup, headerExtra }: AppShellProps) {
  // Staff portals show the signed-in person; student and parent portals pass the child they are viewing.
  const { me, role } = authStore.useValue();
  const user = me && role !== "student" && role !== "parent"
    ? { ...shown, name: me.user.name, initials: me.user.name.replace(/^(Dr|Mr|Mrs|Ms).?s+/, "").split(/s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() }
    : shown;
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // close the mobile drawer on navigation
  useEffect(() => setOpen(false), [location.pathname]);

  const isActive = (href: string) =>
    href === home ? location.pathname === href : location.pathname === href || location.pathname.startsWith(`${href}/`);

  const allItems = [...nav, ...(setup ?? [])].flatMap((g) => g.items);
  const current = [...allItems].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(i.href));
  const setupActive = !!setup?.some((g) => g.items.some((i) => isActive(i.href)));

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden" onClick={() => setOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-semibold leading-tight text-foreground">School ERP</p>
            <p className="text-xs text-muted-foreground">{portal} Portal</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {nav.map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{group.label}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        className={cn(
                          "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        )}
                      >
                        <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white">
              {user.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.subtitle}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={async () => { await logout(); clearAllStores(); navigate("/login"); }}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{portal}</p>
            <p className="truncate text-sm font-semibold text-foreground">{current?.name ?? "Dashboard"}</p>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {headerExtra}
            {setup && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={setupActive ? "secondary" : "ghost"} size="sm" className="gap-1.5">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Setup</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {setup.map((group, gi) => (
                    <div key={group.label ?? gi}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      {group.label && <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">{group.label}</DropdownMenuLabel>}
                      {group.items.map((item) => (
                        <DropdownMenuItem key={item.href} asChild className={cn("gap-2", isActive(item.href) && "bg-accent text-accent-foreground")}>
                          <Link to={item.href}>
                            <item.icon className="h-4 w-4" />
                            {item.name}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <span className="hidden rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground md:inline-block">
              AY 2025-26
            </span>
            <ThemeSwitcher />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
