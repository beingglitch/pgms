"use client";

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { inr } from "@/lib/format";
import type { bucketDuesAging } from "@/lib/charges";

const chartConfig = {
  amount: { label: "Outstanding" },
} satisfies ChartConfig;

/** Horizontal bar per aging bucket: how much of what's owed has been late how long. */
export function DuesAgingChart({ buckets }: { buckets: ReturnType<typeof bucketDuesAging> }) {
  // recharts' "auto" domain doesn't reliably size to the data, so it's
  // computed by hand - padded 10% so the longest bar doesn't touch the edge.
  const max = Math.max(1, ...buckets.map((b) => b.amount)) * 1.1;

  return (
    <ChartContainer config={chartConfig} className="h-[130px] w-full">
      <BarChart data={[...buckets]} layout="vertical" margin={{ left: 4, right: 44, top: 2, bottom: 2 }}>
        <XAxis type="number" hide domain={[0, max]} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={72}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Bar dataKey="amount" radius={4} barSize={15} isAnimationActive={false}>
          {buckets.map((b) => (
            <Cell key={b.key} fill={b.color} />
          ))}
          <LabelList
            dataKey="amount"
            position="right"
            formatter={(value: unknown) => (typeof value === "number" && value > 0 ? inr(value) : "")}
            style={{ fontSize: 11, fontWeight: 700, fill: "var(--foreground)" }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
