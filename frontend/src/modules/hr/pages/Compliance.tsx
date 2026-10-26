import { useSearchParams } from "react-router";
import { Download, Landmark } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { monthLabel } from "@/components/hr/hrDocs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "@/store/inventory";
import { usePayroll } from "@/store/hr";

interface Row { employeeCode: string; name: string; gross: number; pfWage: number; pfEmployee: number; pfEmployer: number; esiEmployee: number; esiEmployer: number; pt: number; tds: number }
interface Report {
  month: string; employees: number; rows: Row[];
  totals: { pfEmployee: number; pfEmployer: number; pfTotal: number; esiEmployee: number; esiEmployer: number; esiTotal: number; pt: number; tds: number };
  due: { pf: string; esi: string; tds: string };
}

/** Statutory dues of a processed payroll month: PF (ECR), ESI, professional tax and TDS. */
export function Compliance() {
  const runs = usePayroll();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? runs.at(-1)?.month ?? null;
  const { data, error } = useApi<Report>(month ? `/payroll/${month}/compliance` : null);
  const t = data?.totals;

  const cards = t ? [
    { title: "Provident Fund (EPF)", amount: t.pfTotal, due: data.due.pf, lines: [["Employee share (12%)", t.pfEmployee], ["Employer share (12%)", t.pfEmployer]] },
    { title: "ESI", amount: t.esiTotal, due: data.due.esi, lines: [["Employee (0.75%)", t.esiEmployee], ["Employer (3.25%)", t.esiEmployer]] },
    { title: "Professional tax", amount: t.pt, due: "as per state", lines: [] },
    { title: "Income tax (TDS on salary)", amount: t.tds, due: data.due.tds, lines: [] },
  ] : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Statutory Compliance" description="PF, ESI, professional tax and TDS deducted in payroll — what to deposit and by when."
        actions={
          <div className="flex gap-2">
            <Select value={month ?? ""} onValueChange={(m) => setParams({ month: m })}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Choose a month" /></SelectTrigger>
              <SelectContent>{[...runs].reverse().map((r) => <SelectItem key={r.month} value={r.month}>{monthLabel(r.month)}</SelectItem>)}</SelectContent>
            </Select>
            {data && (
              <Button variant="outline" className="gap-2" onClick={() => downloadCsv(`statutory-${data.month}.csv`, ["Emp code", "Name", "Gross", "PF wage", "PF (EE)", "PF (ER)", "ESI (EE)", "ESI (ER)", "PT", "TDS"],
                data.rows.map((r) => [r.employeeCode, r.name, r.gross, r.pfWage, r.pfEmployee, r.pfEmployer, r.esiEmployee, r.esiEmployer, r.pt, r.tds]))}><Download className="h-4 w-4" /> CSV</Button>
            )}
          </div>
        } />
      {!month && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Process a payroll first.</CardContent></Card>}
      {error && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{error}</CardContent></Card>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.title} className="gap-0">
                <CardContent className="p-4">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Landmark className="h-4 w-4" /> {c.title}</p>
                  <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{rupees(c.amount)}</p>
                  {c.lines.map(([l, v]) => <p key={l as string} className="flex justify-between text-xs text-muted-foreground"><span>{l}</span><span className="tabular-nums">{rupees(v as number)}</span></p>)}
                  <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Deposit by {c.due}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="gap-0">
            <CardHeader className="pb-3"><CardTitle className="text-base">{monthLabel(data.month)} · {data.employees} employees</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground">
                  {["Employee", "Gross", "PF wage", "PF (EE)", "PF (ER)", "ESI (EE)", "ESI (ER)", "PT", "TDS"].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-border/60">
                  {data.rows.map((r) => (
                    <tr key={r.employeeCode}>
                      <td className="px-3 py-2"><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.employeeCode}</p></td>
                      {[r.gross, r.pfWage, r.pfEmployee, r.pfEmployer, r.esiEmployee, r.esiEmployer, r.pt, r.tds].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{v ? rupees(v) : "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
