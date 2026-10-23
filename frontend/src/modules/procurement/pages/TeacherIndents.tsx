import { useMemo, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { daysFromToday } from "@/lib/dates";
import { useItems } from "@/store/inventory";
import { cancelIndent, hodDecision, hodOf, inr, raiseIndent, useIndents, type IndentLine, type Priority } from "@/store/procurement";
import { useCurrentTeacher } from "@/store/session";
import { useTeachers } from "@/store/teachers";
import { ErrorText, IndentCard, useAction } from "../components";

const UNITS = ["pcs", "packs", "boxes", "bottles", "sets", "kg", "litres", "reams"];
const blankLine = (): IndentLine => ({ name: "", qty: 1, unit: "pcs", estRate: 0 });

export function TeacherIndents() {
  const me = useCurrentTeacher();
  const { teachers } = useTeachers();
  const indents = useIndents();
  const items = useItems();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ location: "", purpose: "", priority: "Normal" as Priority, neededBy: daysFromToday(7) });
  const [lines, setLines] = useState<IndentLine[]>([blankLine()]);
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const { error, setError, run } = useAction();
  const decide = useAction();

  const isHod = !!me?.positions.includes("Head of Department (HOD)");
  const mine = indents.filter((i) => i.requestedBy.teacherId === me?.id);
  const deptPending = indents.filter((i) => isHod && i.status === "PENDING_HOD" && i.department === me?.department);
  const hod = me ? hodOf(me.department, teachers) : undefined;
  const total = useMemo(() => lines.reduce((s, l) => s + (l.qty || 0) * (l.estRate || 0), 0), [lines]);

  if (!me) return <p className="text-sm text-muted-foreground">Sign in as a teacher.</p>;

  const setLine = (i: number, patch: Partial<IndentLine>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  /** Picking a name the store already stocks links the item and fills unit and rate. */
  const onName = (i: number, name: string) => {
    const item = items.find((it) => it.name.toLowerCase() === name.trim().toLowerCase());
    setLine(i, item ? { name, itemId: item.id, unit: item.unit, estRate: item.unitPrice, category: item.category } : { name, itemId: undefined });
  };

  const submit = () =>
    run(
      async () => {
        const created = await raiseIndent({ ...form, department: me.department, lines }, { role: "teacher", name: me.name, teacherId: me.id }, hod);
        toast.success(`${created.no} raised — ${created.status === "PENDING_HOD" ? `waiting for ${hod?.name} (HOD)` : "sent to the store"}`);
      },
      () => {
        setOpen(false);
        setLines([blankLine()]);
        setForm({ location: "", purpose: "", priority: "Normal", neededBy: daysFromToday(7) });
      },
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requisitions"
        description="Ask for lab, classroom or sports items. Track every step until they reach you."
        actions={<Button className="gap-2" onClick={() => { setError(null); setOpen(true); }}><Plus className="h-4 w-4" />New requisition</Button>}
      />

      <Card>
        <CardContent className="grid gap-2 p-4 text-sm text-muted-foreground sm:grid-cols-4">
          {[
            ["1. You raise it", "List what is needed and why"],
            [`2. ${hod && hod.id !== me.id ? `HOD (${hod.name})` : "HOD"}`, hod && hod.id !== me.id ? "Checks the need" : "Skipped — no other HOD in your department"],
            ["3. Store → Principal", "Given from stock, or approved for purchase"],
            ["4. Purchase → you", "Ordered, received, checked and handed over"],
          ].map(([t, d]) => (
            <div key={t}><p className="font-medium text-foreground">{t}</p><p>{d}</p></div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue={deptPending.length ? "approve" : "mine"}>
        <TabsList>
          <TabsTrigger value="mine">My requisitions ({mine.length})</TabsTrigger>
          {isHod && <TabsTrigger value="approve">Department approvals ({deptPending.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {mine.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No requisitions yet. Use "New requisition" when your lab or class runs short of something.</CardContent></Card>}
          {mine.map((i) => (
            <IndentCard
              key={i.id}
              indent={i}
              actions={["PENDING_HOD", "PENDING_STORE", "PENDING_PRINCIPAL", "PENDING_MANAGEMENT", "APPROVED_FOR_PURCHASE"].includes(i.status) ? (
                <Button variant="outline" size="sm" onClick={() => { if (window.confirm(`Cancel ${i.no}?`)) run(() => cancelIndent(i.id, { role: "teacher", name: me.name }, "No longer needed"), () => toast.success(`${i.no} cancelled`)); }}>Cancel requisition</Button>
              ) : undefined}
            />
          ))}
        </TabsContent>

        {isHod && (
          <TabsContent value="approve" className="mt-4 space-y-3">
            <ErrorText error={decide.error} />
            {deptPending.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nothing waiting for you.</CardContent></Card>}
            {deptPending.map((i) => (
              <IndentCard
                key={i.id}
                indent={i}
                defaultOpen
                actions={
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input placeholder="Remark (required to reject)" value={remarks[i.id] ?? ""} onChange={(e) => setRemarks({ ...remarks, [i.id]: e.target.value })} aria-label="Remark" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decide.run(() => hodDecision(i.id, { role: "teacher", name: me.name }, true, remarks[i.id] ?? ""), () => toast.success(`${i.no} approved — sent to the store`))}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide.run(() => hodDecision(i.id, { role: "teacher", name: me.name }, false, remarks[i.id] ?? ""), () => toast.success(`${i.no} rejected`))}>Reject</Button>
                    </div>
                  </div>
                }
              />
            ))}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>New requisition</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Department</Label><Input value={me.department} disabled /></div>
            <div className="space-y-2"><Label htmlFor="loc">Where is it needed?</Label><Input id="loc" placeholder="e.g. Chemistry Lab" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="purpose">Why is it needed?</Label><Textarea id="purpose" rows={2} placeholder="e.g. Class 11 practicals next week" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="needed">Needed by</Label><Input id="needed" type="date" value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v: Priority) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Normal">Normal</SelectItem><SelectItem value="Urgent">Urgent</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Items <span className="font-normal text-muted-foreground">— names the store already keeps are suggested</span></p>
            <datalist id="store-items">{items.map((it) => <option key={it.id} value={it.name} />)}</datalist>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[2fr_0.7fr_0.9fr_0.9fr_auto]">
                <Input className="col-span-2 sm:col-span-1" list="store-items" placeholder="Item name" value={l.name} onChange={(e) => onName(i, e.target.value)} aria-label="Item name" />
                <Input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(0, Number(e.target.value)) })} aria-label="Quantity" />
                <Select value={l.unit} onValueChange={(v) => setLine(i, { unit: v })}>
                  <SelectTrigger aria-label="Unit"><SelectValue /></SelectTrigger>
                  <SelectContent>{[...new Set([l.unit, ...UNITS])].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={0} placeholder="₹ / unit" value={l.estRate || ""} onChange={(e) => setLine(i, { estRate: Number(e.target.value) })} aria-label="Estimated rate" />
                <Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} aria-label="Remove item"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus className="h-4 w-4" />Add item</Button>
              <p className="text-sm text-muted-foreground">Estimated total <span className="font-semibold text-foreground">{inr(total)}</span></p>
            </div>
          </div>
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="gap-2" onClick={submit}><Send className="h-4 w-4" />Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
