import { Card, CardContent } from "@/components/ui/card";
import { Check, Minus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { usePermissions, useRoles } from "@/store/users";

/** Read-only matrix of which permissions each role has (from the database). */
export function RolesPermissions() {
  const roles = useRoles();
  const permissions = usePermissions();
  const modules = [...new Set(permissions.map((p) => p.module))];

  return (
    <div className="space-y-6">
      <PageHeader title="Roles & Permissions" description="What each role is allowed to do. The server checks these on every request." />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-card text-left font-medium text-muted-foreground px-4 py-3 min-w-64">Permission</th>
                {roles.map((r) => (
                  <th key={r.code} className="px-2 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap [writing-mode:vertical-rl] rotate-180 h-40 align-bottom">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.flatMap((m) => [
                <tr key={`m-${m}`} className="bg-muted/40">
                  <td colSpan={roles.length + 1} className="sticky left-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m}</td>
                </tr>,
                ...permissions.filter((p) => p.module === m).map((p) => (
                  <tr key={p.code} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="sticky left-0 bg-card px-4 py-2">
                      <p className="font-medium text-foreground">{p.description}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{p.code}</p>
                    </td>
                    {roles.map((r) => (
                      <td key={r.code} className="text-center px-2 py-2">
                        {r.permissions.includes(p.code) ? <Check className="h-4 w-4 text-emerald-600 mx-auto" aria-label="allowed" /> : <Minus className="h-3 w-3 text-muted-foreground/40 mx-auto" aria-label="not allowed" />}
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">A role applies where it was given: the whole organization, a region, or one branch. Students and parents see only their own records.</p>
    </div>
  );
}
