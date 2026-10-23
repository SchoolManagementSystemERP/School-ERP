import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen, FileText, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { useAssignments } from "@/store/assignments";
import { onLeaveToday, useLeaves } from "@/store/hr";
import { useNotes } from "@/store/notes";
import { teacherSubjects, useCurrentTeacher } from "@/store/session";
import { useTeachers } from "@/store/teachers";

export const HOD_POSITION = "Head of Department (HOD)";

/** HOD view: the teachers in their department and how their teaching work is going. */
export function MyDepartment() {
  const me = useCurrentTeacher();
  const { teachers } = useTeachers();
  const assignments = useAssignments();
  const notes = useNotes();
  const leaves = useLeaves();

  if (!me?.positions.includes(HOD_POSITION)) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Department" description="For heads of department" />
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Only heads of department can see this page.</CardContent></Card>
      </div>
    );
  }

  const dept = teachers.filter((t) => t.department === me.department);
  const rows = dept.map((t) => {
    const mine = assignments.filter((a) => a.teacher === t.name);
    const ungraded = mine.reduce((n, a) => n + a.submissions.filter((s) => s.marksObtained === undefined).length, 0);
    return {
      t,
      subjects: teacherSubjects(t),
      assignments: mine.length,
      ungraded,
      notes: notes.filter((n) => n.uploadedBy === t.name).length,
      away: onLeaveToday(leaves, "teacher", t.id),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title={`My Department · ${me.department}`} description="Teachers in your department and their teaching activity" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Teachers" value={dept.length} icon={Users} tone="indigo" />
        <StatCard label="Assignments set" value={rows.reduce((a, r) => a + r.assignments, 0)} icon={BookOpen} tone="blue" hint={`${rows.reduce((a, r) => a + r.ungraded, 0)} submissions to grade`} />
        <StatCard label="Notes shared" value={rows.reduce((a, r) => a + r.notes, 0)} icon={FileText} tone="green" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Department Teachers</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Subjects</TableHead>
                <TableHead className="text-right">Assignments</TableHead>
                <TableHead className="text-right">To grade</TableHead>
                <TableHead className="text-right">Notes</TableHead>
                <TableHead>Today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.t.id}>
                  <TableCell>
                    <p className="font-medium">{r.t.name}</p>
                    <p className="text-xs text-muted-foreground">{r.t.designation}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.subjects.join(", ")}</TableCell>
                  <TableCell className="text-right">{r.assignments}</TableCell>
                  <TableCell className={`text-right ${r.ungraded ? "text-amber-600 font-semibold" : ""}`}>{r.ungraded}</TableCell>
                  <TableCell className="text-right">{r.notes}</TableCell>
                  <TableCell><Badge variant={r.away ? "outline" : "secondary"}>{r.away ? "On leave" : "In school"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
