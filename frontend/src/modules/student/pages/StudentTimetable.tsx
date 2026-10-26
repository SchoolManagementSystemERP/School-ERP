import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import { Coffee, User } from "lucide-react";
import { shortClassName } from "@/data/classes";
import { minutesOf } from "@/lib/format";
import { useCurrentStudent } from "@/store/session";
import { useWeeklyTimetable, type PlannedPeriod } from "@/store/timetable";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const todayDow = () => ((new Date().getDay() + 6) % 7) + 1;

type Slot = { kind: "class"; period: PlannedPeriod; start: string; end: string } | { kind: "break"; start: string; end: string };

/** A day's periods with breaks where there is a gap between two periods. */
function slotsOf(periods: PlannedPeriod[]): Slot[] {
  const out: Slot[] = [];
  periods.forEach((p, i) => {
    const [start, end] = p.timeSlot.split("–").map((t) => t.trim());
    const prevEnd = periods[i - 1]?.timeSlot.split("–")[1]?.trim();
    if (prevEnd && prevEnd !== start) out.push({ kind: "break", start: prevEnd, end: start });
    out.push({ kind: "class", period: p, start, end });
  });
  return out;
}

/** Ticks every minute so "now" stays current while the page is open. */
function useNowMinutes() {
  const [now, setNow] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().getHours() * 60 + new Date().getMinutes()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function StudentTimetable() {
  const student = useCurrentStudent();
  const weekly = useWeeklyTimetable();
  const nowMin = useNowMinutes();
  const days = student ? weekly[shortClassName(student.class)] ?? {} : {};
  const schoolDays = Object.keys(days).map(Number).sort((a, b) => a - b);
  const today = todayDow();
  const [selected, setSelected] = useState<number | null>(null);
  const day = selected ?? (schoolDays.includes(today) ? today : schoolDays.find((d) => d > today) ?? schoolDays[0]);
  const slots = slotsOf(days[day] ?? []);
  const isToday = day === today;
  const maxPeriods = Math.max(0, ...schoolDays.map((d) => days[d].length));

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">Timetable</h1>
        <p className="mt-1 text-sm text-muted-foreground">{student?.class ?? ""}{student ? " · " : ""}Room {student ? shortClassName(student.class) : ""}</p>
      </div>

      {schoolDays.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">The timetable for your class has not been set yet.</CardContent></Card>
      )}

      {schoolDays.length > 0 && (
        <>
          {/* Day picker */}
          <div role="tablist" aria-label="Day">
            <div className="grid gap-1.5 sm:flex sm:w-max sm:gap-2" style={{ gridTemplateColumns: `repeat(${schoolDays.length}, minmax(0, 1fr))` }}>
              {schoolDays.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={d === day}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "flex flex-col items-center rounded-xl border px-1 py-2 text-sm font-medium transition-colors sm:min-w-[64px] sm:px-3",
                    d === day ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent",
                  )}
                >
                  <span>{DAYS[d - 1].slice(0, 3)}</span>
                  {d === today && <span className={cn("text-[10px] font-normal", d === day ? "text-primary-foreground/80" : "text-primary")}>Today</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            {/* The chosen day */}
            <Card className="gap-0 xl:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{DAYS[day - 1]}{isToday ? " (today)" : ""}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {slots.map((s, i) => {
                  const now = isToday && nowMin >= minutesOf(s.start) && nowMin < minutesOf(s.end);
                  const past = isToday && nowMin >= minutesOf(s.end);
                  if (s.kind === "break") {
                    return (
                      <div key={`b${i}`} className={cn("flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground", past && "opacity-55", now && "ring-2 ring-primary")}>
                        <span className="w-[92px] shrink-0 text-xs tabular-nums">{s.start} – {s.end}</span>
                        <Coffee className="h-4 w-4" /> Break
                      </div>
                    );
                  }
                  return (
                    <div key={s.period.periodNo} className={cn("flex items-center gap-3 rounded-xl border px-3 py-3", now ? "border-primary bg-primary/5" : "border-border", past && "opacity-55")}>
                      <div className="w-[92px] shrink-0">
                        <p className="text-xs tabular-nums text-muted-foreground">{s.start} – {s.end}</p>
                        <p className="text-[11px] text-muted-foreground">Period {s.period.periodNo}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{s.period.subjectName}</p>
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><User className="h-3 w-3" /> {s.period.teacherName || "—"}</p>
                      </div>
                      {now && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Now</span>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* The whole week (wide screens) */}
            <Card className="hidden gap-0 xl:col-span-3 xl:flex">
              <CardHeader className="pb-3"><CardTitle className="text-base">Week at a glance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-1 text-xs">
                  <thead>
                    <tr>
                      <th className="w-14 text-left font-medium text-muted-foreground">Period</th>
                      {schoolDays.map((d) => (
                        <th key={d} className={cn("rounded-md py-1.5 font-medium", d === today ? "bg-primary/10 text-primary" : "text-muted-foreground")}>{DAYS[d - 1].slice(0, 3)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxPeriods }, (_, i) => (
                      <tr key={i}>
                        <td className="text-muted-foreground">{i + 1}</td>
                        {schoolDays.map((d) => {
                          const p = days[d][i];
                          return (
                            <td key={d} className={cn("rounded-md px-2 py-2 text-center", d === day ? "bg-primary/5" : "bg-muted/40")} title={p ? `${p.subjectName} · ${p.teacherName} · ${p.timeSlot}` : ""}>
                              <span className="font-medium text-foreground">{p?.subjectCode || p?.subjectName || "—"}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
