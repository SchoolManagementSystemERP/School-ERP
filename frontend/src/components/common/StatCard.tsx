import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";

export type StatTone = "indigo" | "blue" | "green" | "amber" | "orange" | "red" | "purple" | "teal" | "pink";

const TONES: Record<StatTone, string> = {
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
  red: "bg-red-500/10 text-red-600 dark:text-red-300",
  purple: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-300",
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  /** Small line under the value, e.g. "+12 this term". */
  hint?: React.ReactNode;
  /** Makes the whole card a link. */
  href?: string;
}

/** The one stat tile used on every dashboard and summary row. */
export function StatCard({ label, value, icon: Icon, tone = "indigo", hint, href }: StatCardProps) {
  const body = (
    <Card className={cn("h-full gap-0", href && "transition-all hover:-translate-y-0.5 hover:shadow-md")}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-display text-[26px] font-semibold leading-none tracking-tight text-foreground">{value}</p>
          {hint && <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link to={href} className="block">{body}</Link> : body;
}

/** Maps a legacy colour class (e.g. "text-violet-600", "bg-blue-500") to a StatCard tone. */
export function toneFrom(colorClass: string): StatTone {
  const c = colorClass.match(/(indigo|blue|green|emerald|amber|yellow|orange|red|purple|violet|teal|pink)/)?.[1] ?? "indigo";
  const map: Record<string, StatTone> = { emerald: "green", yellow: "amber", violet: "purple" };
  return (map[c] ?? c) as StatTone;
}
