import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, KeyRound, ShieldCheck, UserX } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { useStaff } from "@/store/hr";
import { useStudents } from "@/store/students";
import { useTeachers } from "@/store/teachers";
import { useRoles, useUsers } from "@/store/users";

export function AdminDashboard() {
  const users = useUsers();
  const roles = useRoles();
  const { teachers } = useTeachers();
  const { students } = useStudents();
  const staff = useStaff();
  const disabled = users.filter((u) => !u.isActive).length;
  const neverSignedIn = users.filter((u) => !u.lastLoginAt).length;
  const byRole = roles
    .map((r) => ({ code: r.code, name: r.name, count: users.filter((u) => u.memberships.some((m) => m.role.code === r.code)).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const records = [
    { name: "Students", count: students.length },
    { name: "Teachers", count: teachers.length },
    { name: "Non-teaching staff", count: staff.length },
    { name: "Sign-in accounts", count: users.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" description="Accounts, access and school records" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Login accounts" value={users.length} icon={KeyRound} tone="indigo" href="/admin/users" />
        <StatCard label="Disabled accounts" value={disabled} icon={UserX} tone="red" href="/admin/users" />
        <StatCard label="Roles in use" value={byRole.length} icon={ShieldCheck} tone="purple" href="/admin/roles" />
        <StatCard label="Never signed in" value={neverSignedIn} icon={Clock} tone="teal" hint="accounts not used yet" href="/admin/users" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Accounts by Role</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {byRole.map((r) => (
              <div key={r.code} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-foreground">{r.name}</span>
                <span className="font-semibold text-foreground">{r.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">School Records</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {records.map((r) => (
              <div key={r.name} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-foreground">{r.name}</span>
                <span className="font-semibold text-foreground">{r.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
