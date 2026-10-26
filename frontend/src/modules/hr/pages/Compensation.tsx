import { useState } from "react";
import { Calculator, Search } from "lucide-react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { CtcTable } from "@/components/hr/hrDocs";
import { useCtcPreview } from "@/components/hr/useCtcPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rupees } from "@/lib/format";
import { act, useApi } from "@/lib/useApi";

interface StaffRow { id: string; employeeCode: string; name: string; designation: string; staffType: string; status: string; basicSalary: number | null; allowances: Record<string, number | null> | null }

const grossOf = (s: StaffRow) => (s.basicSalary ?? 0) + Object.values(s.allowances ?? {}).reduce<number>((t, v) => t + Number(v ?? 0), 0);

/** CTC calculator and every employee's salary structure (payroll enrolment). */
export function Compensation() {
  const { data, reload } = useApi<StaffRow[]>("/staff?type=ALL");
  const [ctc, setCtc] = useState(600000);
  const [basicPct, setBasicPct] = useState(40);
  const preview = useCtcPreview(ctc, basicPct);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [newCtc, setNewCtc] = useState(0);
  const editPreview = useCtcPreview(editing ? newCtc : 0);

  const q = search.toLowerCase();
  const staff = (data ?? []).filter((s) => !q || `${s.name} ${s.employeeCode} ${s.designation}`.toLowerCase().includes(q));
  const save = async () => {
    if (!editing) return;
    if (await act(() => api.put(`/staff/${editing.id}/compensation`, { ctcAnnual: newCtc }), `Salary structure saved for ${editing.name}`)) { setEditing(null); void reload(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Compensation" description="CTC calculator, salary structures and payroll enrolment. Statutory rules (PF, ESI, PT, TDS) are set in HR Settings." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="gap-0 xl:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-5 w-5 text-primary" /> CTC calculator</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Annual CTC (₹)</Label><Input type="number" min={10000} step={1000} value={ctc} onChange={(e) => setCtc(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Basic (% of CTC)</Label><Input type="number" min={10} max={80} value={basicPct} onChange={(e) => setBasicPct(Number(e.target.value))} /></div>
            </div>
            {preview ? <CtcTable b={preview} /> : <p className="text-sm text-muted-foreground">Enter a CTC of at least ₹10,000.</p>}
          </CardContent>
        </Card>

        <Card className="gap-0 xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="text-base">Salary structures</CardTitle>
            <div className="relative w-56"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 pl-8" placeholder="Search staff" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </CardHeader>
          <CardContent className="max-h-[640px] overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Employee</th><th className="px-2 py-2 text-right font-medium">Basic</th><th className="px-2 py-2 text-right font-medium">Gross / month</th><th className="px-4 py-2" />
              </tr></thead>
              <tbody className="divide-y divide-border/60">
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2"><p className="font-medium text-foreground">{s.name}</p><p className="text-xs text-muted-foreground">{s.employeeCode} · {s.designation}</p></td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.basicSalary ? rupees(s.basicSalary) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{grossOf(s) ? rupees(grossOf(s)) : <span className="text-amber-600">not enrolled</span>}</td>
                    <td className="px-4 py-2 text-right"><Button size="sm" variant="outline" onClick={() => { setEditing(s); setNewCtc(Math.round(grossOf(s) * 12 * 1.1) || 300000); }}>Set CTC</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Salary structure — {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>New annual CTC (₹)</Label><Input type="number" min={10000} step={1000} value={newCtc} onChange={(e) => setNewCtc(Number(e.target.value))} /></div>
            {editPreview && <CtcTable b={editPreview} />}
            <p className="text-xs text-muted-foreground">Applies from the next payroll run. Basic and allowances are replaced by this structure.</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} disabled={!editPreview}>Save structure</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
