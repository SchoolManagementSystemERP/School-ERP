import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Gift, PartyPopper, Sun } from "lucide-react";
import { holidaysForCurrentYear, type Holiday } from "@/data/calendar";
import { daysUntil } from "@/lib/dates";

const TYPE_META: Record<Holiday["type"], { label: string; icon: typeof Gift; className: string }> = {
  national: { label: "National Holiday", icon: Gift, className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  vacation: { label: "Vacation", icon: Sun, className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  school: { label: "School Event", icon: PartyPopper, className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
};

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const length = (h: Holiday) => daysUntil(h.end) - daysUntil(h.start) + 1;

export function StudentHolidays() {
  const holidays = holidaysForCurrentYear();
  const upcoming = holidays.filter((h) => daysUntil(h.end) >= 0);
  const next = upcoming[0];
  const totalDays = holidays.reduce((a, h) => a + length(h), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">Holidays</h1>
        <p className="text-sm text-muted-foreground mt-1">School holiday calendar for the academic year</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-0">
          <CardContent className="p-6">
            <p className="opacity-80 text-sm">Next holiday</p>
            {next ? (
              <>
                <p className="text-3xl font-bold mt-2">{next.name}</p>
                <p className="opacity-90 mt-1">
                  {fmt(next.start)}{next.end !== next.start && ` – ${fmt(next.end)}`}
                </p>
                <p className="mt-3 text-sm bg-white/20 inline-block px-3 py-1 rounded-full">
                  {daysUntil(next.start) <= 0 ? "On now" : `in ${daysUntil(next.start)} day${daysUntil(next.start) > 1 ? "s" : ""}`}
                </p>
              </>
            ) : (
              <p className="text-xl font-semibold mt-2">No more holidays this academic year</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-foreground/60">This academic year</p>
            <p className="text-4xl font-bold text-foreground mt-2">{totalDays}</p>
            <p className="text-sm text-foreground/60">holiday days · {holidays.length} occasions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Holiday List</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {holidays.map((h) => {
            const meta = TYPE_META[h.type];
            const past = daysUntil(h.end) < 0;
            return (
              <div key={h.name} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border border-border rounded-xl ${past ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${meta.className}`}><meta.icon className="h-4 w-4" /></div>
                  <div>
                    <p className="font-medium text-foreground">{h.name}</p>
                    <p className="text-sm text-foreground/60">
                      {fmt(h.start)}{h.end !== h.start && ` – ${fmt(h.end)}`} · {length(h)} day{length(h) > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <Badge className={meta.className}>{past ? "Done" : meta.label}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <p className="text-xs text-foreground/50">Festival holidays (Holi, Diwali, Eid, etc.) follow the lunar calendar and are announced by the school each year.</p>
    </div>
  );
}
