import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Save } from "lucide-react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/components/ui/utils";
import { today } from "@/lib/dates";
import { fmtWeekday } from "@/lib/format";
import { act, useApi } from "@/lib/useApi";

type Status = "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "HOLIDAY" | "WEEK_OFF";
interface Day { status: Status; inTime?: string | null; outTime?: string | null; leaveType?: string; marked: boolean }
interface Register { from: string; to: string; staff: { id: string; name: string; employeeCode: string; designation: string; staffType: string; days: Record<string, Day> }[] }
type Entry = { status: Status; inTime: string; outTime: string };

const OPTIONS: { value: Status; short: string; label: string; className: string }[] = [
  { value: "PRESENT", short: "P", label: "Present", className: "bg-emerald-500 text-white" },
  { value: "ABSENT", short: "A", label: "Absent", className: "bg-red-500 text-white" },
  { value: "HALF_DAY", short: "½", label: "Half day", className: "bg-amber-500 text-white" },
  { value: "LEAVE", short: "L", label: "On leave", className: "bg-blue-500 text-white" },
  { value: "HOLIDAY", short: "H", label: "Holiday", className: "bg-slate-500 text-white" },
  { value: "WEEK_OFF", short: "W", label: "Week off", className: "bg-slate-400 text-white" },
];
const optionOf = (s: Status) => OPTIONS.find((o) => o.value === s)!;

/** The staff register: mark a day, or see a month at a glance. */
export function StaffAttendance() {
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const day = useApi<Register>(`/staff-attendance?date=${date}`);
  const monthly = useApi<Register>(`/staff-attendance?month=${month}`);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [saving, setSaving] = useState(false);

  // start from what is saved (approved leave shows as "On leave")
  useEffect(() => {
    if (!day.data) return;
    setEntries(Object.fromEntries(day.data.staff.map((s) => {
      const d = s.days[date];
      return [s.id, { status: d?.status ?? ("" as Status), inTime: d?.inTime ?? "", outTime: d?.outTime ?? "" }];
    })));
  }, [day.data, date]);

  const staff = day.data?.staff ?? [];
  const unmarked = staff.filter((s) => !entries[s.id]?.status).length;
  const counts = useMemo(() => Object.fromEntries(OPTIONS.map((o) => [o.value, Object.values(entries).filter((e) => e.status === o.value).length])), [entries]);

  const set = (id: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const markRest = () => setEntries((e) => Object.fromEntries(Object.entries(e).map(([id, v]) => [id, v.status ? v : { ...v, status: "PRESENT" as Status }])));
  const save = async () => {
    const list = Object.entries(entries).filter(([, v]) => v.status).map(([staffId, v]) => ({ staffId, status: v.status, inTime: v.inTime || null, outTime: v.outTime || null }));
    if (!list.length) return;
    setSaving(true);
    const ok = await act(() => api.put("/staff-attendance", { date, entries: list }), `Register saved for ${list.length} staff`);
    setSaving(false);
    if (ok) { void day.reload(); if (date.startsWith(month)) void monthly.reload(); }
  };

  const days = monthly.data ? Array.from({ length: new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Staff Attendance" description="Daily register of teaching and non-teaching staff. Unapproved absences become loss of pay in payroll." />
      <Tabs defaultValue="day">
        <TabsList><TabsTrigger value="day">Mark a day</TabsTrigger><TabsTrigger value="month">Month summary</TabsTrigger></TabsList>

        <TabsContent value="day" className="space-y-4">
          <Card className="gap-0"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="w-44" />
              <span className="text-sm text-muted-foreground">{fmtWeekday(date)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {OPTIONS.slice(0, 4).map((o) => <span key={o.value} className="rounded-full bg-muted px-2.5 py-1">{o.label}: <strong>{counts[o.value] ?? 0}</strong></span>)}
              {unmarked > 0 && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">Not marked: <strong>{unmarked}</strong></span>}
            </div>
          </CardContent></Card>

          <Card className="gap-0">
            <CardContent className="divide-y divide-border p-0">
              {staff.map((s) => {
                const e = entries[s.id] ?? { status: "" as Status, inTime: "", outTime: "" };
                const leave = s.days[date]?.leaveType;
                return (
                  <div key={s.id} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 lg:w-64">
                      <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.employeeCode} · {s.designation}{leave ? ` · approved ${leave.toLowerCase()} leave` : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {OPTIONS.map((o) => (
                        <button key={o.value} type="button" title={o.label} aria-pressed={e.status === o.value} onClick={() => set(s.id, { status: o.value })}
                          className={cn("h-8 min-w-8 rounded-md border px-2 text-xs font-semibold transition-colors", e.status === o.value ? `${o.className} border-transparent` : "border-border bg-card text-muted-foreground hover:bg-accent")}>
                          {o.short}<span className="ml-1 hidden font-normal sm:inline">{o.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 lg:ml-auto">
                      <Input type="time" aria-label="In time" value={e.inTime} onChange={(ev) => set(s.id, { inTime: ev.target.value })} className="h-8 w-28" disabled={!["PRESENT", "HALF_DAY"].includes(e.status)} />
                      <Input type="time" aria-label="Out time" value={e.outTime} onChange={(ev) => set(s.id, { outTime: ev.target.value })} className="h-8 w-28" disabled={!["PRESENT", "HALF_DAY"].includes(e.status)} />
                    </div>
                  </div>
                );
              })}
              {!day.loading && staff.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No staff found.</p>}
            </CardContent>
          </Card>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="gap-2" onClick={markRest} disabled={!unmarked}><CheckCheck className="h-4 w-4" /> Mark the rest present</Button>
            <Button className="gap-2" onClick={save} disabled={saving || unmarked === staff.length}><Save className="h-4 w-4" /> Save register</Button>
          </div>
        </TabsContent>

        <TabsContent value="month" className="space-y-4">
          <Input type="month" value={month} max={today().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          <Card className="gap-0"><CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 bg-card px-3 py-2 text-left font-medium text-muted-foreground">Staff</th>
                  {days.map((d) => <th key={d} className="px-1 py-2 font-medium text-muted-foreground">{Number(d.slice(8))}</th>)}
                  {["P", "A", "½", "L"].map((h) => <th key={h} className="px-2 py-2 font-medium text-muted-foreground">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(monthly.data?.staff ?? []).map((s) => {
                  const c = (st: Status) => days.filter((d) => s.days[d]?.status === st).length;
                  return (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="sticky left-0 whitespace-nowrap bg-card px-3 py-1.5 text-foreground">{s.name}</td>
                      {days.map((d) => {
                        const v = s.days[d];
                        return <td key={d} className="px-0.5 py-1 text-center">{v ? <span className={cn("inline-block h-5 w-5 rounded text-[10px] font-semibold leading-5", optionOf(v.status).className, !v.marked && "opacity-60")}>{optionOf(v.status).short}</span> : <span className="text-muted-foreground/40">·</span>}</td>;
                      })}
                      <td className="px-2 text-center font-medium">{c("PRESENT")}</td>
                      <td className="px-2 text-center font-medium text-red-600 dark:text-red-400">{c("ABSENT")}</td>
                      <td className="px-2 text-center">{c("HALF_DAY")}</td>
                      <td className="px-2 text-center">{c("LEAVE")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground">Faded “L” = approved leave not yet marked on the register.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
