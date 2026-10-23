import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyRound, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { errorMessage } from "@/api/client";
import { authStore } from "@/store/auth";
import { resetPassword, roleNames, setUserActive, useRoles, useUsers } from "@/store/users";

const lastSeen = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never");

export function UsersAccess() {
  const users = useUsers();
  const roles = useRoles();
  const me = authStore.useValue().me?.user.id;
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [limit, setLimit] = useState(60);

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () => users.filter((u) =>
      (role === "all" || u.memberships.some((m) => m.role.code === role)) &&
      (!q || u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || (u.phone ?? "").includes(q))),
    [users, role, q],
  );
  const usedRoles = roles.filter((r) => users.some((u) => u.memberships.some((m) => m.role.code === r.code)));

  const toggle = (id: string, label: string, enabled: boolean) => {
    if (id === me && !enabled) { toast.error("You cannot disable your own account"); return; }
    setUserActive(id, enabled);
    toast.success(`${label} ${enabled ? "can sign in again" : "can no longer sign in"}`);
  };

  const reset = async (id: string, label: string) => {
    if (!window.confirm(`Give ${label} a new temporary password? Their current password stops working.`)) return;
    try {
      const password = await resetPassword(id);
      toast.success(`Temporary password for ${label}: ${password}`, { description: "They must choose a new one when they sign in.", duration: 30000 });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Users & Access" description={`${users.length} sign-in accounts. Disabled accounts cannot sign in.`} />

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search username, name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {usedRoles.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="text-right">Password</TableHead>
                <TableHead className="text-right">Can sign in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.slice(0, limit).map((u) => (
                <TableRow key={u.id} className={u.isActive ? "" : "opacity-60"}>
                  <TableCell className="font-mono text-xs">{u.username}</TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell><Badge variant="secondary">{roleNames(u)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{lastSeen(u.lastLoginAt)}{u.mustChangePassword ? " · must change password" : ""}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1" disabled={u.id === me} onClick={() => reset(u.id, u.name)}><KeyRound className="h-3.5 w-3.5" /> Reset</Button>
                  </TableCell>
                  <TableCell className="text-right"><Switch checked={u.isActive} onCheckedChange={(v) => toggle(u.id, u.name, v)} aria-label={`Enable ${u.username}`} /></TableCell>
                </TableRow>
              ))}
              {!shown.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No accounts match.</TableCell></TableRow>}
            </TableBody>
          </Table>
          {shown.length > limit && (
            <button className="w-full py-3 text-sm text-primary hover:underline" onClick={() => setLimit((l) => l + 60)}>
              Show more ({shown.length - limit} remaining)
            </button>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Staff sign in with their username, students with their admission number and parents with their phone number. Accounts are created with the person (teachers, students, staff).</p>
    </div>
  );
}
