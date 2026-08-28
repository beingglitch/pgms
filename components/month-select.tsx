"use client";

import { useRouter } from "next/navigation";
import { periodLabel } from "@/lib/charges";

/** Newest-first month picker, grouped by year, that navigates via `?month=`. */
export function MonthSelect({ months, value }: { months: string[]; value: string }) {
  const router = useRouter();

  const byYear = new Map<string, string[]>();
  for (const m of [...months].reverse()) {
    const year = m.slice(0, 4);
    const group = byYear.get(year) ?? [];
    group.push(m);
    byYear.set(year, group);
  }

  return (
    <select
      value={value}
      onChange={(e) => router.push(`/?month=${e.target.value}`)}
      className="rounded-md border-none bg-transparent text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Select month"
    >
      {Array.from(byYear.entries()).map(([year, monthsInYear]) => (
        <optgroup key={year} label={year}>
          {monthsInYear.map((m) => (
            <option key={m} value={m}>
              {periodLabel(m)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
