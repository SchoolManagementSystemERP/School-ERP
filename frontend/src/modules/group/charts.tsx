import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { compactInr } from "@/modules/inventory/charts";
import { inr } from "@/store/procurement";

// categorical slots 1 and 2 of the validated chart palette (same as the inventory charts), per theme
const feeConfig = {
  collected: { label: "Collected", theme: { light: "#2a78d6", dark: "#3987e5" } },
  overdue: { label: "Overdue", theme: { light: "#eb6834", dark: "#d95926" } },
} satisfies ChartConfig;
const oneConfig = { value: { label: "Value", theme: { light: "#2a78d6", dark: "#3987e5" } } } satisfies ChartConfig;

const shortMonth = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const rowHeight = (n: number) => Math.max(140, n * 46 + 40);

/** Fees collected vs overdue, one row per school. */
export function FeeBySchoolChart({ data }: { data: { name: string; collected: number; overdue: number }[] }) {
  return (
    <ChartContainer config={feeConfig} className="aspect-auto w-full" style={{ height: rowHeight(data.length) + 30 }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }} barGap={2} barCategoryGap={8}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={compactInr} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={140} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent formatter={(v, name) => <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{feeConfig[name as keyof typeof feeConfig].label}</span><span className="font-medium tabular-nums">{inr(Number(v))}</span></span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={[0, 4, 4, 0]} maxBarSize={16} />
        <Bar dataKey="overdue" fill="var(--color-overdue)" radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ChartContainer>
  );
}

/** One percentage per school (attendance, results), 0–100. */
export function PercentBySchoolChart({ data, label }: { data: { name: string; value: number | null }[]; label: string }) {
  const rows = data.filter((d) => d.value != null);
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">No {label.toLowerCase()} data yet.</p>;
  return (
    <ChartContainer config={oneConfig} className="aspect-auto w-full" style={{ height: rowHeight(rows.length) }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={140} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideIndicator formatter={(v) => <span className="font-medium tabular-nums">{label}: {Number(v)}%</span>} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  );
}

/** Fee collection of the whole group (or one region) per month. */
export function CollectionTrendChart({ data }: { data: { month: string; value: number }[] }) {
  return (
    <ChartContainer config={oneConfig} className="aspect-auto h-[240px] w-full">
      <BarChart data={data.map((d) => ({ ...d, label: shortMonth(d.month) }))} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compactInr} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideIndicator formatter={(v) => <span className="font-medium tabular-nums">Collected {inr(Number(v))}</span>} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ChartContainer>
  );
}
