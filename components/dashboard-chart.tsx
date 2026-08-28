"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MonthPoint = {
  period: string;
  short: string;
  billed: number;
  collected: number;
  spend: number;
  net: number;
  ratePct: number;
};

export type AgingBucket = { key: string; label: string; amount: number; color: string };

const chartConfig = {
  billed: { label: "Billed", color: "var(--color-secondary)" },
  collected: { label: "Collected", color: "var(--color-chart-rent)" },
  spend: { label: "Spends", color: "var(--color-chart-power)" },
  net: { label: "Net", color: "var(--color-foreground)" },
  occupied: { label: "Beds filled", color: "var(--color-primary)" },
} satisfies ChartConfig;

const TABS = [
  { key: "collection", label: "Collected" },
  { key: "net", label: "Net" },
  { key: "beds", label: "Beds" },
  { key: "aging", label: "Aging" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const BAR_W = 20;

export function DashboardChart({
  months,
  occupied,
  capacity,
  aging,
}: {
  months: MonthPoint[];
  occupied: { period: string; short: string; occupied: number }[];
  capacity: number;
  aging: AgingBucket[];
}) {
  const [tab, setTab] = useState<Tab>("collection");

  const hasMoney = months.some((m) => m.billed > 0 || m.collected > 0 || m.spend > 0);
  const agingTotal = aging.reduce((s, b) => s + b.amount, 0);

  // recharts' "auto" domain doesn't reliably size to the data with two
  // overlapping bars sharing an axis, so the domain is computed by hand -
  // padded 10% so the tallest bar doesn't touch the chart's top edge.
  const moneyMax = Math.max(1, ...months.map((m) => Math.max(m.billed, m.collected))) * 1.1;
  const netPosMax = Math.max(1, ...months.map((m) => Math.max(m.collected, m.net, 0))) * 1.15;
  const netNegMax = Math.max(1, ...months.map((m) => m.spend)) * 1.15;
  const agingMax = Math.max(1, ...aging.map((b) => b.amount)) * 1.1;

  return (
    <div className="rounded-2xl border border-border bg-background p-3.5 shadow-card">
      <div className="mb-3 flex w-fit gap-0.5 rounded-xl bg-muted p-[3px]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-[10px] px-3 py-1.5 text-[11.5px] font-bold transition-colors",
              tab === t.key ? "bg-background text-foreground shadow-card" : "text-muted-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "collection" && (
        <ChartBlock
          title="Collected against billed"
          caption="How much of what's billed each month actually comes in. Bars under 90% turn marigold."
          legend={[
            { label: "Billed", color: "var(--secondary)" },
            { label: "Collected", color: "var(--chart-rent)" },
            { label: "Under 90%", color: "var(--marigold)" },
          ]}
        >
          {!hasMoney ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={chartConfig} className="h-[168px] w-full">
              <BarChart data={months} barGap={-BAR_W} margin={{ top: 18, left: 0, right: 0, bottom: 0 }}>
                <XAxis dataKey="short" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide domain={[0, moneyMax]} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => inr(Number(v))} />} />
                <Bar dataKey="billed" fill="var(--color-billed)" radius={4} barSize={BAR_W} isAnimationActive={false} />
                <Bar dataKey="collected" radius={4} barSize={BAR_W} isAnimationActive={false}>
                  {months.map((m) => (
                    <Cell key={m.period} fill={m.ratePct < 90 ? "var(--marigold)" : "var(--color-collected)"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </ChartBlock>
      )}

      {tab === "net" && (
        <ChartBlock
          title="Money in, money out"
          caption="Collections above the line, spends below it, net as the line on top."
          legend={[
            { label: "Collected", color: "var(--chart-rent)" },
            { label: "Spends", color: "var(--chart-power)" },
            { label: "Net", color: "var(--foreground)" },
          ]}
        >
          {!hasMoney ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={chartConfig} className="h-[168px] w-full">
              <ComposedChart data={months.map((m) => ({ ...m, spendNeg: -m.spend }))} margin={{ top: 18, left: 0, right: 0, bottom: 0 }}>
                <XAxis dataKey="short" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide domain={[-netNegMax, netPosMax]} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => inr(Math.abs(Number(v)))} />} />
                <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                <Bar dataKey="collected" fill="var(--color-collected)" radius={4} barSize={BAR_W} stackId="flow" isAnimationActive={false} />
                <Bar dataKey="spendNeg" fill="var(--color-spend)" radius={4} barSize={BAR_W} stackId="flow" isAnimationActive={false} />
                <Line type="monotone" dataKey="net" stroke="var(--color-net)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </ComposedChart>
            </ChartContainer>
          )}
        </ChartBlock>
      )}

      {tab === "beds" && (
        <ChartBlock
          title="Beds filled against capacity"
          caption={`How occupancy has tracked against the ${capacity}-bed capacity.`}
          legend={[
            { label: "Beds filled", color: "var(--primary)" },
            { label: `Capacity (${capacity})`, color: "var(--input)" },
          ]}
        >
          {capacity === 0 ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={chartConfig} className="h-[168px] w-full">
              <AreaChart data={occupied} margin={{ top: 18, left: 0, right: 0, bottom: 0 }}>
                <XAxis dataKey="short" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis hide domain={[0, capacity]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine y={capacity} stroke="var(--input)" strokeDasharray="4 4" label={{ value: `${capacity} beds`, fontSize: 10, fill: "var(--muted-foreground)", position: "insideTopRight" }} />
                <Area
                  type="monotone"
                  dataKey="occupied"
                  stroke="var(--color-occupied)"
                  strokeWidth={2}
                  fill="var(--color-occupied)"
                  fillOpacity={0.12}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </ChartBlock>
      )}

      {tab === "aging" && (
        <ChartBlock
          title="Dues aging"
          caption={agingTotal > 0.005 ? `How old the ${inr(agingTotal)} outstanding is.` : "Nobody's overdue right now."}
        >
          {agingTotal <= 0.005 ? (
            <EmptyChart label="Nothing overdue." />
          ) : (
            <ChartContainer config={chartConfig} className="h-[130px] w-full">
              <BarChart data={aging} layout="vertical" margin={{ top: 0, left: 0, right: 32, bottom: 0 }}>
                <XAxis type="number" hide domain={[0, agingMax]} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={70} fontSize={11} />
                <Bar dataKey="amount" radius={4} barSize={13} isAnimationActive={false}>
                  {aging.map((b) => (
                    <Cell key={b.key} fill={b.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </ChartBlock>
      )}
    </div>
  );
}

function ChartBlock({
  title,
  caption,
  legend,
  children,
}: {
  title: string;
  caption: string;
  legend?: { label: string; color: string }[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-display text-[15px] font-semibold tracking-tight">{title}</p>
      <p className="mb-2 text-[11.5px] leading-[1.45] text-muted-foreground">{caption}</p>
      {children}
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyChart({ label = "Once payments and spends start coming in, they'll chart here." }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>;
}
