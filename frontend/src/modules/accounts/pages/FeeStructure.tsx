import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { parseClassName } from "@/data/classes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { annualFee, saveFeeHead, saveLateFeeRule, saveStudentConcession, useFeeHeads, useFeePlan, useFeeRules, type FeeHeadPlan, type LateFeeRule } from "@/store/fees";
import { inr } from "@/store/finance";
import { gradeStore } from "@/store/classes";
import { useStudents } from "@/store/students";

const FEE_HEADS = [
  ["TRANSPORT", "Transport"], ["HOSTEL", "Hostel"], ["LIBRARY", "Library"], ["EXAMINATION", "Examination"],
  ["LAB", "Lab"], ["ADMISSION", "Admission"], ["SECURITY_DEPOSIT", "Security deposit"], ["OTHER", "Other"],
] as const;
const DEFAULT_COMPONENTS: Record<string, string[]> = {
  TUITION: ["Academic", "Development", "Activities"],
  TRANSPORT: ["Bus / Route", "Transport maintenance"],
  HOSTEL: ["Accommodation", "Mess"],
  LIBRARY: ["Library"],
  EXAMINATION: ["Examination"],
  LAB: ["Laboratory"],
  ADMISSION: ["Admission"],
  SECURITY_DEPOSIT: ["Refundable deposit"],
  OTHER: ["Other"],
};
const feeHeadLabel = (feeHead: string) => feeHead === "TUITION" ? "Tuition" : FEE_HEADS.find(([key]) => key === feeHead)?.[1] ?? feeHead;

export function FeeStructure() {
  const plan = useFeePlan();
  const rules = useFeeRules();
  const feeHeads = useFeeHeads();
  const { students } = useStudents();
  const [headOpen, setHeadOpen] = useState(false);
  const [headDraft, setHeadDraft] = useState<FeeHeadPlan | null>(null);
  const [lateFeeType, setLateFeeType] = useState<LateFeeRule["type"]>("DAILY_FLAT");
  const [lateFeeAmount, setLateFeeAmount] = useState("");
  const [concessionStudent, setConcessionStudent] = useState("");
  const [concessionType, setConcessionType] = useState("MERIT");
  const [concessionPercent, setConcessionPercent] = useState("");

  const grades = Object.keys(plan).map(Number).sort((a, b) => a - b);
  const schoolGrades = gradeStore.getAll().filter((g) => g.id > 0);

  useEffect(() => {
    setLateFeeType(rules.lateFeeRule.type);
    setLateFeeAmount(String(rules.lateFeeRule.amount));
  }, [rules.lateFeeRule.type, rules.lateFeeRule.amount]);

  const openFeeHead = (gradeId: string, grade: string, feeHead: string) => {
    const existing = feeHeads.find((head) => head.gradeId === gradeId && head.feeHead === feeHead);
    const schedule = existing?.installments.length ? existing.installments : rules.installments;
    setHeadDraft({
      gradeId, grade, branchId: existing?.branchId ?? "",
      feeHead, annualAmount: existing?.annualAmount ?? 0,
      components: existing?.components?.length
        ? existing.components.map((component) => ({ ...component }))
        : (DEFAULT_COMPONENTS[feeHead] ?? ["Other"]).map((name) => ({ name, amount: 0 })),
      installments: schedule.length
        ? schedule.map((item) => ({ ...item }))
        : [{ no: 1, name: "Annual Fee", dueDate: new Date().toISOString().slice(0, 10), percent: 100 }],
    });
    setHeadOpen(true);
  };

  const saveHead = async () => {
    if (!headDraft || headDraft.components.length === 0 || headDraft.components.some((component) => !component.name.trim() || !Number.isFinite(component.amount) || component.amount < 0)) {
      toast.error("Add at least one valid fee component");
      return;
    }
    const annualAmount = Math.round(headDraft.components.reduce((sum, component) => sum + Number(component.amount), 0) * 100) / 100;
    if (annualAmount <= 0) { toast.error("Fee component total must be greater than zero"); return; }
    if (new Set(headDraft.components.map((component) => component.name.trim().toLocaleLowerCase())).size !== headDraft.components.length) {
      toast.error("Fee component names must be unique");
      return;
    }
    if (Math.abs(headDraft.installments.reduce((sum, item) => sum + Number(item.percent), 0) - 100) > 0.01) {
      toast.error("Installment percentages must add up to 100%");
      return;
    }
    try {
      await saveFeeHead(headDraft.gradeId, headDraft.feeHead, annualAmount, headDraft.installments, headDraft.components);
      toast.success(`${feeHeadLabel(headDraft.feeHead)} fee plan saved for ${headDraft.grade}`);
      setHeadOpen(false);
      setHeadDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this fee plan");
    }
  };

  const saveRule = async () => {
    const amount = Number(lateFeeAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid late fee amount");
      return;
    }
    try {
      await saveLateFeeRule({ type: lateFeeType, amount });
      toast.success("Late fee rule updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the late fee rule");
    }
  };

  const saveConcession = async () => {
    const percent = Number(concessionPercent);
    if (!concessionStudent || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
      toast.error("Choose a student and enter a concession from 0.01% to 100%");
      return;
    }
    try {
      await saveStudentConcession(Number(concessionStudent), concessionType, percent);
      toast.success(`${concessionType.replaceAll("_", " ")} concession saved`);
      setConcessionPercent("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this concession");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Fee Structure" description="Set class-wise fees, itemized components, installment dates and late-fee rules" />

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
                <TableHead>Tuition breakdown</TableHead>
                <TableHead>Expected (after concessions)</TableHead>
                <TableHead>Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grades.map((g) => {
                const inGrade = students.filter((s) => parseClassName(s.class).grade === g);
                const expected = inGrade.reduce((a, s) => a + annualFee(s), 0);
                const grade = schoolGrades.find((item) => parseClassName(item.className).grade === g);
                const tuition = feeHeads.find((head) => head.gradeId === String(grade?.id) && head.feeHead === "TUITION");
                return (
                  <TableRow key={g}>
                    <TableCell className="font-medium">Class {g}</TableCell>
                    <TableCell>{inGrade.length}</TableCell>
                    <TableCell className="font-semibold">{inr(plan[g])}</TableCell>
                    <TableCell className="text-muted-foreground">{inr(plan[g] / Math.max(1, rules.installments.length))}</TableCell>
                    <TableCell className="text-sm">{tuition?.components.map((component) => `${component.name}: ${inr(component.amount)}`).join(" · ") ?? "No component breakdown yet"}</TableCell>
                    <TableCell>{inr(expected)}</TableCell>
                    <TableCell>
                      {grade && <Button variant="outline" size="sm" onClick={() => openFeeHead(String(grade.id), grade.className, "TUITION")}>Break down</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-3">Changes apply to every unpaid installment. Concessions recorded on a student's profile are deducted automatically.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">Additional Fee Heads</CardTitle><p className="mt-1 text-sm text-muted-foreground">Configure transport, hostel, library, examination, lab, admission and refundable deposit plans by grade.</p></div>
          <Select onValueChange={(gradeId) => {
            const grade = schoolGrades.find((item) => item.id > 0 && String(item.id) === gradeId);
            if (grade) openFeeHead(String(grade.id), grade.className, "TRANSPORT");
          }}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="Add fee plan by class" /></SelectTrigger>
            <SelectContent>{schoolGrades.map((grade) => <SelectItem key={grade.id} value={String(grade.id)}>{grade.className}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {feeHeads.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No additional fee plans configured yet. Use the class selector to add one.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Class</TableHead><TableHead>Fee head</TableHead><TableHead>Components</TableHead><TableHead>Annual total</TableHead><TableHead>Installments</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{feeHeads.map((head) => (
                <TableRow key={`${head.gradeId}-${head.feeHead}`}>
                  <TableCell className="font-medium">{head.grade}</TableCell>
                  <TableCell>{FEE_HEADS.find(([key]) => key === head.feeHead)?.[1] ?? head.feeHead}</TableCell>
                  <TableCell className="text-sm">{head.components.map((component) => `${component.name}: ${inr(component.amount)}`).join(" · ")}</TableCell>
                  <TableCell>{inr(head.annualAmount)}</TableCell>
                  <TableCell>{head.installments.length}</TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => openFeeHead(head.gradeId, head.grade, head.feeHead)}>Edit plan</Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
          {grades.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {schoolGrades.filter((g) => g.id > 0 && grades.includes(parseClassName(g.className).grade)).map((grade) => (
                <Select key={grade.id} onValueChange={(feeHead) => openFeeHead(String(grade.id), grade.className, feeHead)}>
                  <SelectTrigger className="w-52"><SelectValue placeholder={`Add head · ${grade.className}`} /></SelectTrigger>
                  <SelectContent>{FEE_HEADS.filter(([key]) => !feeHeads.some((head) => head.gradeId === String(grade.id) && head.feeHead === key)).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                </Select>
              ))}
            </div>
          )}
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
          <CardHeader><CardTitle className="text-base">Rules & late fee</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground/80">
            <p>• Choose a fixed, daily flat, percentage, or daily-compounding percentage penalty after an installment is overdue.</p>
            <p>• Concessions (merit, sibling, RTE, staff ward…) are a percentage of the annual fee, set on the student's profile.</p>
            <p>• RTE students with 100% concession are not billed.</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
              <div className="space-y-2"><Label>Penalty type</Label><Select value={lateFeeType} onValueChange={(value: LateFeeRule["type"]) => setLateFeeType(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DAILY_FLAT">Flat amount per day</SelectItem><SelectItem value="FLAT">One-time flat amount</SelectItem><SelectItem value="PERCENTAGE">One-time percentage</SelectItem><SelectItem value="DAILY_COMPOUND">Daily compounding percentage</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>{lateFeeType.includes("PERCENT") || lateFeeType === "DAILY_COMPOUND" ? "Rate (%)" : "Amount (₹)"}</Label><Input type="number" min={0} step="0.01" value={lateFeeAmount} onChange={(event) => setLateFeeAmount(event.target.value)} /></div>
              <Button className="self-end" onClick={saveRule}>Save rule</Button>
            </div>
            <p>• Parents and students can pay online from their portal; cash payments are recorded under Fee Collection.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Merit, aid & family concessions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Assign an approved student concession. Combined percentages reduce tuition and are capped at 100%.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label>Student</Label><Select value={concessionStudent} onValueChange={setConcessionStudent}><SelectTrigger><SelectValue placeholder="Choose student" /></SelectTrigger><SelectContent>{students.map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.name} · {student.class} · Roll {student.rollNo}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Reason</Label><Select value={concessionType} onValueChange={setConcessionType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MERIT">Merit scholarship</SelectItem><SelectItem value="NEED_BASED">Financial aid</SelectItem><SelectItem value="STAFF_WARD">Staff child</SelectItem><SelectItem value="SIBLING">Sibling discount</SelectItem><SelectItem value="RTE">RTE</SelectItem><SelectItem value="CATEGORY">Other approved category</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Discount (%)</Label><Input type="number" min={0.01} max={100} step="0.01" value={concessionPercent} onChange={(event) => setConcessionPercent(event.target.value)} /></div>
            </div>
            <Button onClick={saveConcession} disabled={!concessionStudent || !concessionPercent}>Save concession</Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={headOpen} onOpenChange={setHeadOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{headDraft ? `${feeHeadLabel(headDraft.feeHead)} · ${headDraft.grade}` : "Fee plan"}</DialogTitle></DialogHeader>
          {headDraft && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground">Annual total from components</p>
                <p className="text-xl font-semibold">{inr(headDraft.components.reduce((sum, component) => sum + Number(component.amount), 0))}</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Fee components</p><p className="text-xs text-muted-foreground">Break this fee head into clear charge lines; the amounts add up to the annual total.</p></div>
                  <Button variant="outline" size="sm" disabled={headDraft.components.length >= 30} onClick={() => setHeadDraft({ ...headDraft, components: [...headDraft.components, { name: "", amount: 0 }] })}><Plus className="mr-1 h-4 w-4" /> Add component</Button>
                </div>
                {headDraft.components.map((component, index) => (
                  <div key={`${component.name}-${index}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_180px_32px] sm:items-end">
                    <div className="space-y-1"><Label>Component name</Label><Input placeholder="e.g. Development fee" value={component.name} onChange={(event) => setHeadDraft({ ...headDraft, components: headDraft.components.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} /></div>
                    <div className="space-y-1"><Label>Annual amount (₹)</Label><Input type="number" min={0} step="0.01" value={component.amount} onChange={(event) => setHeadDraft({ ...headDraft, components: headDraft.components.map((item, i) => i === index ? { ...item, amount: Number(event.target.value) || 0 } : item) })} /></div>
                    <Button variant="ghost" size="icon" aria-label="Remove fee component" disabled={headDraft.components.length <= 1} onClick={() => setHeadDraft({ ...headDraft, components: headDraft.components.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Installment schedule</p><p className="text-xs text-muted-foreground">Percentages must total 100%.</p></div><Button variant="outline" size="sm" onClick={() => setHeadDraft({ ...headDraft, installments: [...headDraft.installments, { no: headDraft.installments.length + 1, name: `Installment ${headDraft.installments.length + 1}`, dueDate: new Date().toISOString().slice(0, 10), percent: 0 }] })}><Plus className="mr-1 h-4 w-4" /> Add installment</Button></div>
              <div className="space-y-3">
                {headDraft.installments.map((installment, index) => (
                  <div key={`${installment.no}-${index}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_110px_32px] sm:items-end">
                    <div className="space-y-1"><Label>Name</Label><Input value={installment.name} onChange={(event) => setHeadDraft({ ...headDraft, installments: headDraft.installments.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} /></div>
                    <div className="space-y-1"><Label>Due date</Label><Input type="date" value={installment.dueDate} onChange={(event) => setHeadDraft({ ...headDraft, installments: headDraft.installments.map((item, i) => i === index ? { ...item, dueDate: event.target.value } : item) })} /></div>
                    <div className="space-y-1"><Label>Percent</Label><Input type="number" min={0} max={100} step="0.01" value={installment.percent} onChange={(event) => setHeadDraft({ ...headDraft, installments: headDraft.installments.map((item, i) => i === index ? { ...item, percent: Number(event.target.value) || 0 } : item) })} /></div>
                    <p className="pb-2 text-sm text-muted-foreground">{inr(headDraft.components.reduce((sum, component) => sum + component.amount, 0) * installment.percent / 100)}</p>
                    <Button variant="ghost" size="icon" aria-label="Remove installment" disabled={headDraft.installments.length <= 1} onClick={() => setHeadDraft({ ...headDraft, installments: headDraft.installments.filter((_, i) => i !== index).map((item, i) => ({ ...item, no: i + 1 })) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <p className={`text-sm font-medium ${Math.abs(headDraft.installments.reduce((sum, item) => sum + Number(item.percent), 0) - 100) < 0.01 ? "text-emerald-700" : "text-amber-700"}`}>Installments total: {headDraft.installments.reduce((sum, item) => sum + Number(item.percent), 0).toFixed(2)}%</p>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setHeadOpen(false)}>Cancel</Button><Button onClick={saveHead}>Save fee plan</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
