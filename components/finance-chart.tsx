"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { inr } from "@/lib/format";
import { periodLabel } from "@/lib/charges";

export type MonthFinance = { period: string; collected: number; rent: number; spend: number };

const SERIES = {
  collected: { stroke: "var(--chart-rent)", label: "Total collected" },
  rent: { stroke: "var(--chart-power)", label: "Rent" },
  spend: { stroke: "var(--chart-other)", label: "Spends" },
} as const;

const ZOOM_LEVELS = [3, 6, 12, 24];

/**
 * Hand-drawn SVG for the lines, same reasoning as the earlier
 * CollectionsChart: three thin lines are cheaper to draw by hand than to
 * pull in a charting library for. The SVG stretches non-uniformly to fill a
 * short, wide box (preserveAspectRatio="none"), which is fine for lines but
 * turns circles into flattened ellipses, so the markers, hover column, and
 * per-month click targets are a separate HTML layer positioned by
 * percentage instead, where a circle stays a circle.
 *
 * `data` carries more months than are ever shown at once; window size (zoom)
 * and offset (pan, in months back from the latest) pick a slice of it.
 */
export function FinanceChart({ data }: { data: MonthFinance[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const zoomLevels = useMemo(() => ZOOM_LEVELS.filter((n) => n <= data.length || n === ZOOM_LEVELS[0]), [data.length]);
  const [zoomIndex, setZoomIndex] = useState(() => Math.max(0, zoomLevels.indexOf(6) === -1 ? 0 : zoomLevels.indexOf(6)));
  const windowSize = Math.min(zoomLevels[zoomIndex] ?? data.length, data.length);
  const maxOffset = Math.max(0, data.length - windowSize);
  const [offset, setOffset] = useState(0);
  const clampedOffset = Math.min(offset, maxOffset);
  const windowStart = data.length - windowSize - clampedOffset;
  const view = data.slice(windowStart, windowStart + windowSize);

  function zoomIn() {
    setZoomIndex((i) => Math.max(0, i - 1));
    setHover(null);
  }
  function zoomOut() {
    setZoomIndex((i) => Math.min(zoomLevels.length - 1, i + 1));
    setHover(null);
  }
  function panOlder() {
    setOffset((o) => Math.min(maxOffset, o + windowSize));
    setHover(null);
  }
  function panNewer() {
    setOffset((o) => Math.max(0, o - windowSize));
    setHover(null);
  }

  if (data.length === 0 || data.every((d) => d.collected === 0 && d.rent === 0 && d.spend === 0)) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Once payments and spends start coming in, they&apos;ll chart here month by month.
      </p>
    );
  }

  const max = Math.max(...view.map((d) => Math.max(d.collected, d.rent, d.spend)), 1);
  // The SVG's own coordinate system (viewBox units): width is already 0-100,
  // conveniently the same numbers as a percentage, so x needs no conversion.
  const viewHeight = 132;
  const plotTop = 8;
  const plotBottom = viewHeight - 22;
  const plotHeight = plotBottom - plotTop;
  const stepX = view.length > 1 ? 100 / (view.length - 1) : 0;
  const active = hover !== null ? view[hover] : null;

  function x(i: number) {
    return view.length > 1 ? i * stepX : 50;
  }
  function yUnits(v: number) {
    return plotBottom - (v / max) * plotHeight;
  }
  // The HTML overlay (markers, hover line) lives outside the SVG's distorted
  // coordinate space, so its vertical position needs an actual percentage
  // of the box height, not a viewBox unit.
  function yPercent(v: number) {
    return (yUnits(v) / viewHeight) * 100;
  }

  function pathFor(key: "collected" | "rent" | "spend") {
    return view.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${yUnits(d[key])}`).join(" ");
  }

  const startYear = view[0]?.period.split("-")[0];
  const endYear = view[view.length - 1]?.period.split("-")[0];
  const yearLabel = startYear === endYear ? startYear : `${startYear} - ${endYear}`;

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {(["collected", "rent", "spend"] as const).map((key) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[key].stroke }} />
              {SERIES[key].label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{yearLabel}</span>
          <span className="h-4 w-px bg-border" />
          <button
            type="button"
            onClick={panOlder}
            disabled={clampedOffset >= maxOffset}
            title="Earlier months"
            className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={panNewer}
            disabled={clampedOffset <= 0}
            title="Later months"
            className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoomIndex >= zoomLevels.length - 1}
            title="Zoom out"
            className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoomIndex <= 0}
            title="Zoom in"
            className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative h-40 w-full">
        <svg
          viewBox={`0 0 100 ${viewHeight}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          role="img"
          aria-label={`Collections, rent, and spends over the last ${view.length} months`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-rent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--chart-rent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <line x1="0" y1={plotBottom} x2="100" y2={plotBottom} stroke="currentColor" strokeWidth="0.4" className="text-border" />

          <path
            d={`${pathFor("collected")} L${x(view.length - 1)},${plotBottom} L0,${plotBottom} Z`}
            fill={`url(#${gradientId})`}
            stroke="none"
          />

          {(["spend", "rent", "collected"] as const).map((key) => (
            <path
              key={key}
              d={pathFor(key)}
              fill="none"
              stroke={SERIES[key].stroke}
              strokeWidth={key === "collected" ? 1.6 : 1.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {hover !== null && (
          <div
            className="absolute top-0 w-px bg-border"
            style={{ left: `${x(hover)}%`, height: `${(plotBottom / viewHeight) * 100}%` }}
          />
        )}

        {view.map((d, i) => {
          const colW = view.length > 1 ? stepX : 100;
          const colLeft = view.length > 1 ? x(i) - colW / 2 : 0;
          return (
            <button
              key={d.period}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => router.push(`/ledger?tab=payments&month=${d.period}`)}
              className="absolute top-0 h-full cursor-pointer focus:outline-none"
              style={{ left: `${colLeft}%`, width: `${colW}%` }}
              aria-label={`${periodLabel(d.period)}: open in Ledger`}
            >
              {(["collected", "rent", "spend"] as const).map((key) => (
                <span
                  key={key}
                  className="absolute rounded-full"
                  style={{
                    left: "50%",
                    top: `${yPercent(d[key])}%`,
                    width: hover === i ? 7 : 5,
                    height: hover === i ? 7 : 5,
                    background: SERIES[key].stroke,
                    opacity: hover === null || hover === i ? 1 : 0.45,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {view.map((d) => (
          <span key={d.period}>{periodLabel(d.period).split(" ")[0]}</span>
        ))}
      </div>

      {active && (
        <div className="mt-2 rounded-xl border border-border bg-muted/40 p-2.5 text-xs">
          <p className="mb-1 font-semibold">{periodLabel(active.period)}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span>Collected: <strong className="tabular">{inr(active.collected)}</strong></span>
            <span>Rent: <strong className="tabular">{inr(active.rent)}</strong></span>
            <span>Spends: <strong className="tabular">{inr(active.spend)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
