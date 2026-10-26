import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { act, useApi } from "@/lib/useApi";

interface Settings {
  basicPercent: number; hraPercentOfBasic: number; pfRate: number; pfWageCeiling: number; pfOnActualBasic: boolean;
  esiWageCeiling: number; esiEmployeeRate: number; esiEmployerRate: number; gratuityPercent: number;
  professionalTax: { from: number; amount: number }[]; leavePolicy: Record<string, number>; noticeDays: number;
  encashmentDivisor: number; bonusPercent: number; bonusWageCeiling: number;
}
type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

/** Salary structure and statutory rules used by offers, payroll and the full & final. */
export function HrSettings() {
  const { data } = useApi<Settings>("/hr/settings");
  const [s, setS] = useState<Settings | null>(null);
  const [newLeave, setNewLeave] = useState("");
  useEffect(() => { if (data) setS(data); }, [data]);
  if (!s) return null;

  const num = (k: NumKey, label: string, hint?: string, step = 1) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} step={step} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const save = async () => {
    const r = await act(() => api.put<Settings>("/hr/settings", { ...s, professionalTax: [...s.professionalTax].sort((a, b) => a.from - b.from) }), "HR settings saved");
    if (r) setS(r);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="HR Settings" description="Salary structure and statutory rules — used for CTC annexures, payroll, leave balances and the full & final."
        actions={<Button className="gap-2" onClick={save}><Save className="h-4 w-4" /> Save</Button>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="gap-0"><CardHeader className="pb-3"><CardTitle className="text-base">Salary structure</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {num("basicPercent", "Basic (% of CTC)", undefined, 0.5)}
            {num("hraPercentOfBasic", "HRA (% of basic)", "50% metro, 40% non-metro", 0.5)}
            {num("gratuityPercent", "Gratuity provision (% of basic)", "4.81% = 15/26 ÷ 12", 0.01)}
          </CardContent></Card>

        <Card className="gap-0"><CardHeader className="pb-3"><CardTitle className="text-base">Provident fund & ESI</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {num("pfRate", "PF rate (%)", "Employee and employer each", 0.5)}
            {num("pfWageCeiling", "PF wage ceiling (₹ / month)")}
            <label className="col-span-2 flex items-center justify-between rounded-md border border-border p-3 text-sm">PF on the full basic (above the ceiling)<Switch checked={s.pfOnActualBasic} onCheckedChange={(v) => setS({ ...s, pfOnActualBasic: v })} /></label>
            {num("esiWageCeiling", "ESI applies up to gross (₹)")}
            <div />
            {num("esiEmployeeRate", "ESI employee (%)", undefined, 0.05)}
            {num("esiEmployerRate", "ESI employer (%)", undefined, 0.05)}
          </CardContent></Card>

        <Card className="gap-0"><CardHeader className="pb-3"><CardTitle className="text-base">Professional tax slabs (per month)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.professionalTax.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="whitespace-nowrap text-muted-foreground">Gross from ₹</span>
                <Input className="h-8" type="number" min={0} value={p.from} onChange={(e) => setS({ ...s, professionalTax: s.professionalTax.map((x, k) => (k === i ? { ...x, from: Number(e.target.value) } : x)) })} />
                <span className="whitespace-nowrap text-muted-foreground">tax ₹</span>
                <Input className="h-8 w-28" type="number" min={0} max={2500} value={p.amount} onChange={(e) => setS({ ...s, professionalTax: s.professionalTax.map((x, k) => (k === i ? { ...x, amount: Number(e.target.value) } : x)) })} />
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remove slab" onClick={() => setS({ ...s, professionalTax: s.professionalTax.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setS({ ...s, professionalTax: [...s.professionalTax, { from: 0, amount: 0 }] })}><Plus className="h-4 w-4" /> Slab</Button>
            <p className="text-xs text-muted-foreground">Income tax (TDS) follows the new regime for FY 2025-26 — ₹75,000 standard deduction and the 87A rebate up to ₹12 lakh.</p>
          </CardContent></Card>

        <Card className="gap-0"><CardHeader className="pb-3"><CardTitle className="text-base">Leave, notice & exit</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(s.leavePolicy).map(([type, days]) => (
                <div key={type} className="space-y-1.5">
                  <Label>{type.charAt(0) + type.slice(1).toLowerCase()} leave / year</Label>
                  <Input type="number" min={0} max={365} value={days} onChange={(e) => setS({ ...s, leavePolicy: { ...s.leavePolicy, [type]: Number(e.target.value) } })} />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input className="h-8" placeholder="Add a leave type (e.g. MATERNITY)" value={newLeave} onChange={(e) => setNewLeave(e.target.value.toUpperCase().replace(/[^A-Z_]/g, ""))} />
              <Button size="sm" variant="outline" disabled={newLeave.length < 3 || newLeave in s.leavePolicy} onClick={() => { setS({ ...s, leavePolicy: { ...s.leavePolicy, [newLeave]: 0 } }); setNewLeave(""); }}>Add</Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {num("noticeDays", "Notice period (days)")}
              {num("encashmentDivisor", "Leave encashment divisor", "(Basic + DA) ÷ this × days")}
              {num("bonusPercent", "Bonus (% of basic + DA)", "8.33% minimum", 0.01)}
              {num("bonusWageCeiling", "Bonus eligible up to gross (₹)")}
            </div>
          </CardContent></Card>
      </div>
    </div>
  );
}
