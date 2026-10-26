import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";

type Tone = "blue" | "green" | "red" | "amber" | "violet" | "slate";

const TONES: Record<Tone, string> = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  red: "bg-red-500/10 text-red-600 dark:text-red-300",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  slate: "bg-muted text-muted-foreground",
};

export interface MiniStat {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
}

/** A compact row of small numbers — fits three or four side by side even on a phone. */
export function MiniStats({ items }: { items: MiniStat[] }) {
  return (
    <div className={cn("grid gap-2 sm:gap-4", items.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
      {items.map(({ label, value, icon: Icon, tone = "slate" }) => (
        <Card key={label} className="gap-0">
          <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10", TONES[tone])}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xl font-semibold leading-none text-foreground sm:text-2xl">{value}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-sm">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
