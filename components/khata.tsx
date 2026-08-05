import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "ink" | "owed" | "positive" | "held" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  ink: "text-foreground",
  owed: "text-ledger",
  positive: "text-positive",
  held: "text-marigold-foreground",
  muted: "text-muted-foreground",
};

/**
 * Every rupee figure in the app goes through here, so amounts share one
 * typeface, one alignment, and one meaning per colour: red is owed, green is
 * received, marigold is money held on someone else's behalf.
 */
export function Amount({
  value,
  tone = "ink",
  size = "md",
  className,
}: {
  value: number | string | { toString(): string } | null | undefined;
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
    xl: "text-3xl sm:text-4xl",
  };

  return (
    <span className={cn("khata-amount", sizes[size], TONE_CLASS[tone], className)}>{inr(value)}</span>
  );
}

/** A label above a figure — the unit of the dashboard. Becomes a link when a drill-down exists. */
export function StatTile({
  label,
  value,
  hint,
  tone = "ink",
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        {href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
      </div>
      <p
        className={cn(
          "mt-1.5 font-display text-2xl font-semibold leading-none tracking-tight sm:text-[1.75rem]",
          TONE_CLASS[tone]
        )}
        style={{ fontVariantNumeric: "tabular-nums lining-nums", fontVariationSettings: '"wdth" 95' }}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  );

  const base = "rounded-2xl border border-border bg-background p-4 shadow-card";

  if (!href) return <div className={cn(base, className)}>{body}</div>;

  return (
    <Link
      href={href}
      className={cn(base, "group transition-shadow hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", className)}
    >
      {body}
    </Link>
  );
}

/** A ruled line on the ledger page: who/what on the left, amount on the right. */
export function KhataRow({
  children,
  amount,
  className,
}: {
  children: React.ReactNode;
  amount?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("khata-row", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {amount}
    </div>
  );
}

export function SectionHeading({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-background p-4 shadow-card", className)}>{children}</div>
  );
}

/** Empty states name the next action rather than apologising for the blank. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <Icon className="h-7 w-7 text-muted-foreground" />
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <p className="max-w-xs text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{children}</h1>
      {action}
    </div>
  );
}
