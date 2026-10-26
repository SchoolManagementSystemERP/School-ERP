import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { inr } from "@/store/procurement";

// categorical slots 1 and 2 of the validated chart palette, stepped per theme
const flowConfig = {
  received: { label: "Received (purchases)", theme: { light: "#2a78d6", dark: "#3987e5" } },
  issued: { label: "Issued (consumption)", theme: { light: "#eb6834", dark: "#d95926" } },
} satisfies ChartConfig;
const valueConfig = { value: { label: "Value", theme: { light: "#2a78d6", dark: "#3987e5" } } } satisfies ChartConfig;

const shortMonth = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
export const compactInr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${n}`);

/** Stock in (purchases) vs stock out (consumption) per month, in rupees. */
export function StockFlowChart({ data, height = 280 }: { data: { month: string; issued: number; received: number }[]; height?: number }) {
  return (
    <ChartContainer config={flowConfig} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data.map((c) => ({ ...c, label: shortMonth(c.month) }))} barGap={2} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={compactInr} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent formatter={(v, name) => <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{flowConfig[name as keyof typeof flowConfig].label}</span><span className="font-medium tabular-nums">{inr(Number(v))}</span></span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="received" fill="var(--color-received)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="issued" fill="var(--color-issued)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}

/** One measure across named rows (categories, vendors) as horizontal bars. */
export function ValueBars({ data, labelWidth = 120 }: { data: { name: string; value: number }[]; labelWidth?: number }) {
  return (
    <ChartContainer config={valueConfig} className="aspect-auto w-full" style={{ height: Math.max(160, data.length * 40 + 30) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={compactInr} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={labelWidth} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideIndicator formatter={(v) => <span className="font-medium tabular-nums">{inr(Number(v))}</span>} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  );
}
