"use client";

import { useMemo, useState } from "react";
import { BackButton } from "@/components/back-button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageTitle, Panel } from "@/components/khata";
import { ClipboardList, Search, X } from "lucide-react";
import { monthKey } from "@/lib/format";
import { periodLabel } from "@/lib/charges";
import type { ActivityLogModel } from "@/lib/generated/prisma/models";

export function ActivityClient({ activity }: { activity: ActivityLogModel[] }) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });

  const months = useMemo(
    () => Array.from(new Set(activity.map((a) => monthKey(a.ts)))).sort().reverse(),
    [activity]
  );

  const q = query.trim().toLowerCase();
  const usingRange = range.from !== "" || range.to !== "";

  const filtered = activity.filter((a) => {
    if (q) {
      const haystack = `${a.actor} ${a.action} ${a.detail ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    const day = new Date(a.ts).toISOString().slice(0, 10);
    if (usingRange) {
      if (range.from && day < range.from) return false;
      if (range.to && day > range.to) return false;
    } else if (month !== "all" && monthKey(a.ts) !== month) {
      return false;
    }
    return true;
  });

  const isFiltered = q !== "" || month !== "all" || usingRange;

  return (
    <div>
      <BackButton fallbackHref="/" />
      <PageTitle>Activity log</PageTitle>

      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by who, what, or detail"
              className="pl-9"
            />
          </div>
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setMonth("all");
                setRange({ from: "", to: "" });
              }}
              className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", ...months].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonth(m)}
              disabled={usingRange}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
                !usingRange && month === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "all" ? "All time" : periodLabel(m)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.08em]">Or a custom range</span>
          <Input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="h-8 w-auto"
          />
          <span>to</span>
          <Input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="h-8 w-auto"
          />
        </div>
      </div>

      <Panel>
        {activity.length === 0 ? (
          <EmptyState icon={ClipboardList} chip="blue" title="Nothing yet">
            Every action taken in this app (payments, readings, edits) gets recorded here.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches that filter.</p>
        ) : (
          filtered.map((l) => (
            <div key={l.id} className="khata-row py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-semibold">{l.actor}</span>
                  {" · "}
                  {l.action}
                  {l.detail ? <span className="text-muted-foreground">: {l.detail}</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(l.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
