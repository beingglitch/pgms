"use client";

import { useId, useState } from "react";
import { inr } from "@/lib/format";
import { periodLabel } from "@/lib/charges";

/**
 * Charts are hand-drawn SVG rather than a charting library: two forms, both
 * bar-shaped, in a palette validated against the design system. A dependency
 * would cost more bytes than the twenty lines of geometry it replaces.
 */

const SERIES = {
  collected: { fill: "var(--chart-rent)", label: "Collected" },
  pending: { fill: "var(--chart-power)", label: "Still pending" },
} as const;

export type MonthPoint = { period: string; billed: number; collected: number };

/**
 * Billed per month, split into what came in and what hasn't. Stacked rather
 * than grouped because the two parts sum to something meaningful, the month's
 * total bill, and the gap between them is the collection shortfall.
 */
export function CollectionsChart({ data }: { data: MonthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  if (data.length === 0 || data.every((d) => d.billed === 0)) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Raise this month&apos;s rent and collections will start charting here.
      </p>
    );
  }

  const max = Math.max(...data.map((d) => Math.max(d.billed, d.collected)), 1);
  const height = 132;
  const barWidth = 100 / data.length;
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {(["collected", "pending"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[key].fill }} />
            {SERIES[key].label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-36 w-full overflow-visible"
        role="img"
        aria-label={`Amount billed and collected over the last ${data.length} months`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="100" height={height} />
          </clipPath>
        </defs>

        {/* Recessive baseline: the only rule the chart needs. */}
        <line x1="0" y1={height - 20} x2="100" y2={height - 20} stroke="currentColor" strokeWidth="0.4" className="text-border" />

        {data.map((point, i) => {
          const plotHeight = height - 32;
          const totalH = (point.billed / max) * plotHeight;
          const collectedH = (point.collected / max) * plotHeight;
          const pendingH = Math.max(totalH - collectedH, 0);
          const x = i * barWidth + barWidth * 0.22;
          const w = barWidth * 0.56;
          const baseY = height - 20;

          return (
            <g
              key={point.period}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              className="cursor-default focus:outline-none"
            >
              {/* Full-height hit area, so the target is bigger than the mark. */}
              <rect x={i * barWidth} y="0" width={barWidth} height={height} fill="transparent" />

              {pendingH > 0.5 && (
                <rect
                  x={x}
                  y={baseY - totalH}
                  width={w}
                  height={pendingH}
                  rx="1.2"
                  fill={SERIES.pending.fill}
                  opacity={hover === null || hover === i ? 1 : 0.35}
                />
              )}
              {collectedH > 0.5 && (
                <rect
                  x={x}
                  // A 2px surface gap keeps the two fills from reading as one.
                  y={baseY - collectedH + (pendingH > 0.5 ? 0.8 : 0)}
                  width={w}
                  height={Math.max(collectedH - (pendingH > 0.5 ? 0.8 : 0), 0.5)}
                  rx="1.2"
                  fill={SERIES.collected.fill}
                  opacity={hover === null || hover === i ? 1 : 0.35}
                />
              )}
              <title>
                {periodLabel(point.period)}: {inr(point.collected)} collected of {inr(point.billed)} billed
              </title>
            </g>
          );
        })}
      </svg>

      <div className="flex" aria-hidden>
        {data.map((point, i) => (
          <span
            key={point.period}
            className={`flex-1 text-center text-[10px] font-semibold ${
              hover === i ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {periodLabel(point.period).slice(0, 3)}
          </span>
        ))}
      </div>

      {active && (
        <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-card">
          <p className="font-semibold">{periodLabel(active.period)}</p>
          <p className="tabular text-muted-foreground">
            {inr(active.collected)} collected of {inr(active.billed)} billed
            {active.billed > active.collected && (
              <span className="text-ledger"> · {inr(active.billed - active.collected)} pending</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export type DuesSlice = { label: string; value: number; fill: string };

/**
 * What's owed right now, by kind. A single stacked bar rather than a pie: the
 * parts are being compared to a total, and lengths beat angles for that.
 */
export function OutstandingBar({ slices }: { slices: DuesSlice[] }) {
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Nothing outstanding right now.</p>;
  }

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {shown.map((slice) => (
          <div
            key={slice.label}
            style={{ background: slice.fill, width: `${(slice.value / total) * 100}%` }}
            title={`${slice.label}: ${inr(slice.value)}`}
          />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {shown.map((slice) => (
          <div key={slice.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.fill }} />
              <span className="truncate text-muted-foreground">{slice.label}</span>
            </span>
            <span className="tabular shrink-0 font-semibold">{inr(slice.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
