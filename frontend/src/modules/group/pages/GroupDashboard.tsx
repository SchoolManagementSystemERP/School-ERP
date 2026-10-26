import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Building2, CalendarCheck, Download, GraduationCap, IndianRupee, RefreshCcw, School, TrendingUp, Users, Wallet,
} from "lucide-react";
import { MiniStats } from "@/components/common/MiniStats";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/components/ui/utils";
import { rupees } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { authStore } from "@/store/auth";
import { downloadCsv } from "@/store/inventory";
import { CollectionTrendChart, FeeBySchoolChart, PercentBySchoolChart } from "../charts";

interface Fees { annual: number; dueSoFar: number; collected: number; overdue: number; collectionPercent: number | null }
interface Totals {
  schools: number; students: number; admittedThisYear: number; staff: number; teachers: number; fees: Fees;
  attendancePercent: number | null; resultPercent: number | null; expenses: number; payroll: number;
  openEnquiries: number; openRequisitions: number; openOrderValue: number; lowStockItems: number;
}
interface SchoolRow extends Omit<Totals, "schools" | "payroll"> {
  id: string; code: string; name: string; city: string; region: string | null; regionId: string | null; isActive: boolean;
  payroll: { month: string; net: number } | null; studentsPerTeacher: number | null;
}
interface Overview {
  academicYear: string; generatedAt: string; totals: Totals;
  regions: (Totals & { id: string | null; name: string })[];
  schools: SchoolRow[];
  collectionTrend: { month: string; bySchool: Record<string, number> }[];
}

type SortKey = "name" | "students" | "collected" | "overdue" | "collection" | "attendance" | "result" | "expenses";
const SORTS: Record<SortKey, (s: SchoolRow) => number | string> = {
  name: (s) => s.name, students: (s) => s.students, collected: (s) => s.fees.collected, overdue: (s) => s.fees.overdue,
  collection: (s) => s.fees.collectionPercent ?? -1, attendance: (s) => s.attendancePercent ?? -1, result: (s) => s.resultPercent ?? -1, expenses: (s) => s.expenses,
};

const pctText = (v: number | null) => (v == null ? "—" : `${v}%`);
/** Below a target → amber, well below → red; the label carries the meaning, not only the colour. */
function Level({ value, warn, bad }: { value: number | null; warn: number; bad: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const tone = value < bad ? "text-red-600 dark:text-red-400" : value < warn ? "text-amber-700 dark:text-amber-300" : "text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", tone)}>
      {value < warn && <AlertTriangle className="h-3.5 w-3.5" aria-label={value < bad ? "Well below target" : "Below target"} />}
      {value}%
    </span>
  );
}

/** The head office's view: every school in scope side by side, with group and region totals. */
export function GroupDashboard() {
  const { data, error, reload, loading } = useApi<Overview>("/group/overview");
  const org = authStore.useValue().me?.organization.name ?? "";
  const [region, setRegion] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [openId, setOpenId] = useState<string | null>(null);

  const schools = useMemo(() => {
    const list = (data?.schools ?? []).filter((s) => region === "all" || (s.regionId ?? "none") === region);
    const get = SORTS[sort.key];
    return [...list].sort((a, b) => {
      const x = get(a), y = get(b);
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return sort.desc ? -c : c;
    });
  }, [data, region, sort]);

  if (error) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{error}</CardContent></Card>;
  if (!data) return null;

  const t = region === "all" ? data.totals : data.regions.find((r) => (r.id ?? "none") === region) ?? data.totals;
  const open = data.schools.find((s) => s.id === openId) ?? null;
  const trend = data.collectionTrend.map((m) => ({ month: m.month, value: schools.reduce((sum, s) => sum + (m.bySchool[s.id] ?? 0), 0) }));
  // chart label: the part after the last comma ("…, Gomti Nagar"), which tells schools in one city apart
  const shortName = (s: SchoolRow) => s.name.split(",").pop()!.trim() || s.city || s.code;

  const header = (key: SortKey, label: string, right = true) => (
    <th className={cn("whitespace-nowrap px-3 py-2.5 font-medium", right ? "text-right" : "text-left")}>
      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium hover:text-foreground" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== "name" })}>
        {label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );
  const exportCsv = () => downloadCsv(`group-${data.academicYear}.csv`,
    ["School", "Code", "City", "Region", "Students", "Admitted this year", "Staff", "Teachers", "Fees due so far", "Collected", "Overdue", "Collection %", "Attendance % (30 days)", "Result %", "Expenses", "Payroll month", "Payroll net", "Open enquiries", "Open requisitions", "Low-stock items"],
    schools.map((s) => [s.name, s.code, s.city, s.region ?? "", s.students, s.admittedThisYear, s.staff, s.teachers, s.fees.dueSoFar, s.fees.collected, s.fees.overdue, s.fees.collectionPercent ?? "", s.attendancePercent ?? "", s.resultPercent ?? "", s.expenses, s.payroll?.month ?? "", s.payroll?.net ?? "", s.openEnquiries, s.openRequisitions, s.lowStockItems]));

  return (
    <div className="space-y-6">
      <PageHeader title="Group Dashboard" description={`${org} · academic year ${data.academicYear} · ${data.totals.schools} school${data.totals.schools === 1 ? "" : "s"} in your scope`}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label="Refresh" disabled={loading} onClick={() => void reload()}><RefreshCcw className="h-4 w-4" /></Button>
            <Button variant="outline" className="gap-2" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
          </>
        } />

      {data.regions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[{ id: "all", name: "All schools", n: data.totals.schools }, ...data.regions.map((r) => ({ id: r.id ?? "none", name: r.name, n: r.schools }))].map((r) => (
            <button key={r.id} type="button" onClick={() => setRegion(r.id)}
              className={cn("rounded-full border px-3 py-1 text-sm", region === r.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent")}>
              {r.name} <span className="ml-1 tabular-nums opacity-80">{r.n}</span>
            </button>
          ))}
        </div>
      )}

      <MiniStats items={[
        { label: `Schools · ${t.staff} staff`, value: t.schools, icon: School, tone: "blue" },
        { label: `Students · ${t.admittedThisYear} new`, value: t.students.toLocaleString("en-IN"), icon: GraduationCap, tone: "violet" },
        { label: `Collected · ${pctText(t.fees.collectionPercent)}`, value: rupees(t.fees.collected), icon: IndianRupee, tone: "green" },
        { label: "Fees overdue", value: rupees(t.fees.overdue), icon: Wallet, tone: t.fees.overdue ? "red" : "slate" },
      ]} />
      <MiniStats items={[
        { label: "Attendance (last 30 days)", value: pctText(t.attendancePercent), icon: CalendarCheck, tone: "blue" },
        { label: "Average result (published exams)", value: pctText(t.resultPercent), icon: TrendingUp, tone: "violet" },
        { label: t.payroll ? `Spent this year · payroll ${rupees(t.payroll)}/month` : "Spent this year", value: rupees(t.expenses), icon: Building2, tone: "amber" },
      ]} />

      <Card className="gap-0 overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="text-base">Schools side by side</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {header("name", "School", false)}{header("students", "Students")}<th className="px-3 py-2.5 text-right font-medium">Staff</th>
                {header("collected", "Fees collected")}{header("overdue", "Overdue")}{header("collection", "Collection")}
                {header("attendance", "Attendance")}{header("result", "Result")}{header("expenses", "Spent")}
                <th className="px-3 py-2.5 text-left font-medium">Needs attention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schools.map((s) => {
                const alerts = [
                  s.openEnquiries ? `${s.openEnquiries} enquir${s.openEnquiries === 1 ? "y" : "ies"} to follow up` : "",
                  s.openRequisitions ? `${s.openRequisitions} purchase request${s.openRequisitions === 1 ? "" : "s"}` : "",
                  s.lowStockItems ? `${s.lowStockItems} item${s.lowStockItems === 1 ? "" : "s"} low on stock` : "",
                ].filter(Boolean);
                return (
                  <tr key={s.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setOpenId(s.id)}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.code} · {s.city}{s.region && s.region !== s.city ? ` · ${s.region}` : ""}{!s.isActive ? " · inactive" : ""}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.students.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.staff}{s.studentsPerTeacher != null && <p className="text-[11px] text-muted-foreground">{s.studentsPerTeacher} per teacher</p>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupees(s.fees.collected)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupees(s.fees.overdue)}</td>
                    <td className="px-3 py-3 text-right"><Level value={s.fees.collectionPercent} warn={85} bad={70} /></td>
                    <td className="px-3 py-3 text-right"><Level value={s.attendancePercent} warn={85} bad={75} /></td>
                    <td className="px-3 py-3 text-right"><Level value={s.resultPercent} warn={60} bad={45} /></td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupees(s.expenses)}</td>
                    <td className="max-w-[220px] px-3 py-3 text-xs text-muted-foreground">{alerts.length ? alerts.join(" · ") : "—"}</td>
                  </tr>
                );
              })}
              {schools.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">No schools here.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="-mt-3 text-xs text-muted-foreground">Collection = fees received ÷ fees due so far this year. Amber / red with ⚠ = below target (collection 85 % / 70 %, attendance 85 % / 75 %, result 60 % / 45 %). Click a school for details.</p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="gap-0">
          <CardHeader className="pb-2"><CardTitle className="text-base">Fees collected vs overdue</CardTitle></CardHeader>
          <CardContent><FeeBySchoolChart data={schools.map((s) => ({ name: shortName(s), collected: s.fees.collected, overdue: s.fees.overdue }))} /></CardContent>
        </Card>
        <Card className="gap-0">
          <CardHeader className="pb-2"><CardTitle className="text-base">Fee collection by month{region !== "all" ? " (this region)" : ""}</CardTitle></CardHeader>
          <CardContent><CollectionTrendChart data={trend} /></CardContent>
        </Card>
        <Card className="gap-0">
          <CardHeader className="pb-2"><CardTitle className="text-base">Attendance, last 30 days</CardTitle></CardHeader>
          <CardContent><PercentBySchoolChart label="Attendance" data={schools.map((s) => ({ name: shortName(s), value: s.attendancePercent }))} /></CardContent>
        </Card>
        <Card className="gap-0">
          <CardHeader className="pb-2"><CardTitle className="text-base">Average result, published exams</CardTitle></CardHeader>
          <CardContent><PercentBySchoolChart label="Result" data={schools.map((s) => ({ name: shortName(s), value: s.resultPercent }))} /></CardContent>
        </Card>
      </div>

      {data.regions.length > 1 && region === "all" && (
        <Card className="gap-0 overflow-hidden">
          <CardHeader className="pb-3"><CardTitle className="text-base">By region</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{["Region", "Schools", "Students", "Collected", "Overdue", "Collection", "Attendance", "Result"].map((h, i) => <th key={h} className={cn("px-3 py-2.5 font-medium", i ? "text-right" : "text-left")}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {data.regions.map((r) => (
                  <tr key={r.id ?? "none"} className="cursor-pointer hover:bg-accent/40" onClick={() => setRegion(r.id ?? "none")}>
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.schools}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.students.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupees(r.fees.collected)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupees(r.fees.overdue)}</td>
                    <td className="px-3 py-2.5 text-right"><Level value={r.fees.collectionPercent} warn={85} bad={70} /></td>
                    <td className="px-3 py-2.5 text-right"><Level value={r.attendancePercent} warn={85} bad={75} /></td>
                    <td className="px-3 py-2.5 text-right"><Level value={r.resultPercent} warn={60} bad={45} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">Updated {new Date(data.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. Totals only — no student's or employee's personal records are shown here.</p>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader className="border-b border-border">
                <SheetTitle>{open.name}</SheetTitle>
                <SheetDescription>{open.code} · {open.city}{open.region && open.region !== open.city ? ` · ${open.region}` : ""}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 p-4 text-sm">
                <Section title="People" icon={Users} rows={[
                  ["Students", open.students.toLocaleString("en-IN")], ["Admitted this year", open.admittedThisYear],
                  ["Staff", open.staff], ["Teachers", open.teachers], ["Students per teacher", open.studentsPerTeacher ?? "—"],
                ]} />
                <Section title="Fees this year" icon={IndianRupee} rows={[
                  ["Annual fees (after concessions)", rupees(open.fees.annual)], ["Due so far", rupees(open.fees.dueSoFar)],
                  ["Collected", rupees(open.fees.collected)], ["Overdue", rupees(open.fees.overdue)], ["Collection", pctText(open.fees.collectionPercent)],
                ]} />
                <Section title="Academics" icon={GraduationCap} rows={[
                  ["Attendance, last 30 days", pctText(open.attendancePercent)], ["Average result, published exams", pctText(open.resultPercent)],
                ]} />
                <Section title="Spending" icon={Building2} rows={[
                  ["Expenses this year", rupees(open.expenses)],
                  ["Payroll", open.payroll ? `${rupees(open.payroll.net)} (${open.payroll.month})` : "not run yet"],
                  ["Purchase orders awaiting delivery", rupees(open.openOrderValue)],
                ]} />
                <Section title="Follow-ups" icon={AlertTriangle} rows={[
                  ["Admission enquiries open", open.openEnquiries], ["Purchase requests in progress", open.openRequisitions], ["Items below minimum stock", open.lowStockItems],
                ]} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ title, icon: Icon, rows }: { title: string; icon: typeof Users; rows: [string, string | number][] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-foreground"><Icon className="h-4 w-4 text-primary" /> {title}</h3>
      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-3 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}
