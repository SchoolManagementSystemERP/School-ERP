import { Building2, Contact, GraduationCap, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { ROLE_ACCOUNTS } from "@/store/auth";
import { authStore } from "@/store/session";
import { studentStore } from "@/store/students";

function InfoItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{value || "Not provided"}</p>
    </div>
  );
}

function formatLastLogin(value: string | null) {
  if (!value) return "No previous login recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No previous login recorded"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function MyProfile() {
  const { me, role } = authStore.useValue();
  const students = studentStore.useItems();

  if (!me) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Profile" description="Your account and school information." />
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Profile details are unavailable. Please sign out and sign in again.</CardContent></Card>
      </div>
    );
  }

  const roleLabel = role ? ROLE_ACCOUNTS[role].label : "School Portal";
  const initials = me.user.name
    .replace(/^(Dr|Mr|Mrs|Ms|Shri)\.?\s+/i, "")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const branchName = (id: string) => me.branches.find((branch) => branch.id === id)?.name ?? "Assigned branch";
  const linkedStudents = me.students.map((linked) => ({
    ...linked,
    details: students.find((student) => student.admissionNo === linked.admissionNo),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="View your account, role, and school information." />

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
        <CardContent className="flex flex-col gap-5 pt-6 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">
            {initials || <UserRound className="h-7 w-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-semibold">{me.user.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{me.organization.name}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{roleLabel}</Badge>
              {me.staff && <Badge variant="outline">Employee · {me.staff.employeeCode}</Badge>}
              {me.students.some((student) => student.relation === "SELF") && <Badge variant="outline">Student</Badge>}
              {me.students.some((student) => student.relation === "CHILD") && <Badge variant="outline">Parent / Guardian</Badge>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium text-muted-foreground">Last sign in</p>
            <p className="mt-1 text-sm">{formatLastLogin(me.user.lastLoginAt)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Contact className="h-4 w-4 text-primary" />Account information</CardTitle>
            <CardDescription>Your sign-in and contact details.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <InfoItem label="Full name" value={me.user.name} />
            <InfoItem label="Username" value={me.user.username} />
            <InfoItem label="Email" value={me.user.email} />
            <InfoItem label="Phone" value={me.user.phone} />
            <InfoItem label="Organization" value={me.organization.name} />
            <InfoItem label="Portal" value={roleLabel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Roles and access</CardTitle>
            <CardDescription>Roles and branches linked to your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {me.memberships.map((membership) => {
                const scope = membership.branch?.name
                  ?? membership.region?.name
                  ?? (membership.scopeType === "ORG" ? "Organization-wide" : membership.scopeType);
                return (
                  <Badge key={`${membership.role.code}-${membership.branch?.id ?? membership.region?.id ?? membership.scopeType}`} variant="outline">
                    {membership.role.name} · {scope}
                  </Badge>
                );
              })}
              {!me.memberships.length && <span className="text-sm text-muted-foreground">No roles were found.</span>}
            </div>
            {me.branches.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Branches you can access</p>
                <div className="flex flex-wrap gap-2">
                  {me.branches.map((branch) => <Badge key={branch.id} variant="secondary">{branch.name}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {me.staff && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" />Employee information</CardTitle>
              <CardDescription>Your staff record on file.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <InfoItem label="Employee code" value={me.staff.employeeCode} />
              <InfoItem label="Staff category" value={me.staff.staffType.replace(/_/g, " ")} />
              <InfoItem label="Department" value={me.staff.department} />
              <InfoItem label="Home branch" value={branchName(me.staff.branchId)} />
            </CardContent>
          </Card>
        )}

        {linkedStudents.map((linked) => (
          <Card key={linked.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4 text-primary" />{linked.relation === "SELF" ? "Student information" : "Linked student"}</CardTitle>
              <CardDescription>{linked.relation === "CHILD" ? "A student linked to your parent account." : "Your student record on file."}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <InfoItem label="Name" value={linked.name} />
              <InfoItem label="Admission number" value={linked.admissionNo} />
              <InfoItem label="Class" value={linked.details?.class} />
              <InfoItem label="Roll number" value={linked.details?.rollNo} />
              <InfoItem label="Email" value={linked.details?.email} />
              <InfoItem label="Phone" value={linked.details?.phone} />
              <InfoItem label="Branch" value={branchName(linked.branchId)} />
              {linked.details?.dob && <InfoItem label="Date of birth" value={linked.details.dob} />}
              {linked.details?.bloodGroup && <InfoItem label="Blood group" value={linked.details.bloodGroup} />}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        This profile is read-only. Contact your school administrator to update your account or personal details.
      </p>
    </div>
  );
}
