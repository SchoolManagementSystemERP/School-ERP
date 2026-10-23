import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { parseClassName } from "@/data/classes";
import { annualFee, setGradeFee, useFeePlan, useFeeRules } from "@/store/fees";
import { inr } from "@/store/finance";
import { useStudents } from "@/store/students";

export function FeeStructure() {
  const plan = useFeePlan();
  const rules = useFeeRules();
  const { students } = useStudents();
  const [draft, setDraft] = useState<Record<number, string>>({});

  const grades = Object.keys(plan).map(Number).sort((a, b) => a - b);

  const save = (grade: number) => {
    const value = Number(draft[grade]);
    if (!value || value < 0) { toast.error("Enter a valid amount"); return; }
    setGradeFee(grade, Math.round(value));
    setDraft((d) => { const n = { ...d }; delete n[grade]; return n; });
    toast.success(`Class ${grade} fee set to ${inr(value)} per year`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Fee Structure" description="Annual tuition per class, installments and late fee rules" />

      <Card>
        <CardHeader><CardTitle className="text-base">Annual Tuition by Class</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Annual fee</TableHead>
                <TableHead>Per installment</TableHead>
                <TableHead>Expected (after concessions)</TableHead>
                <TableHead className="w-64">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grades.map((g) => {
                const inGrade = students.filter((s) => parseClassName(s.class).grade === g);
                const expected = inGrade.reduce((a, s) => a + annualFee(s), 0);
                return (
                  <TableRow key={g}>
                    <TableCell className="font-medium">Class {g}</TableCell>
                    <TableCell>{inGrade.length}</TableCell>
                    <TableCell className="font-semibold">{inr(plan[g])}</TableCell>
                    <TableCell className="text-muted-foreground">{inr(plan[g] / Math.max(1, rules.installments.length))}</TableCell>
                    <TableCell>{inr(expected)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Input type="number" min={0} placeholder="New amount" value={draft[g] ?? ""} onChange={(e) => setDraft({ ...draft, [g]: e.target.value })} className="h-8" />
                        <Button size="sm" className="gap-1" onClick={() => save(g)} disabled={!draft[g]}><Save className="h-3.5 w-3.5" /> Save</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-3">Changes apply to every unpaid installment. Concessions recorded on a student's profile are deducted automatically.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Installment Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rules.installments.map((i) => (
              <div key={i.no} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <span className="font-medium text-foreground">{i.name} <span className="text-muted-foreground font-normal">· {i.percent}%</span></span>
                <span className="text-muted-foreground">Due {i.dueDate}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Rules</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-foreground/80">
            <p>• Late fee: <strong>{inr(rules.lateFeePerDay)}</strong> per day after an installment's due date.</p>
            <p>• Concessions (merit, sibling, RTE, staff ward…) are a percentage of the annual fee, set on the student's profile.</p>
            <p>• RTE students with 100% concession are not billed.</p>
            <p>• Parents and students can pay online from their portal; cash payments are recorded under Fee Collection.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
