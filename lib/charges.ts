import type { ChargeType } from "@/lib/generated/prisma/enums";

export type Money = number | string | { toString(): string };

export function num(v: Money | null | undefined) {
  return Number(v ?? 0);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Divide an amount so the parts add back up to exactly the total.
 *
 * A room's electricity bill is a real sum of money that has to be shared out,
 * and splitting ₹1,000 three ways as 333.33 each loses a paisa. The remainder is
 * handed to the earliest shares instead.
 */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const paise = Math.round(total * 100);
  const base = Math.trunc(paise / parts);
  let remainder = paise - base * parts;
  const sign = remainder < 0 ? -1 : 1;
  remainder = Math.abs(remainder);

  return Array.from({ length: parts }, (_, i) => (base + (i < remainder ? sign : 0)) / 100);
}

/**
 * The `bedNumber` sentinel for a tenant who has taken every bed in a room
 * (privately, at the full room rent) rather than sharing a specific one.
 */
export const FULL_ROOM_BED = "full";

export type RoomForSplit = {
  rentAmount: Money;
  capacity: number;
};

/**
 * What one bed in a room costs: the room's total rent divided by its number
 * of beds, fixed regardless of how many are actually filled right now. An
 * empty bed is the property's lost revenue, not a surcharge on whoever's
 * already moved in, a tenant pays for their bed, not for the room.
 */
export function rentShare(room: RoomForSplit): number {
  const roomRent = num(room.rentAmount);
  return room.capacity > 0 ? round2(roomRent / room.capacity) : roomRent;
}

export type TenantForRent = {
  rentAmount: Money;
  rentOverride?: Money | null;
};

/**
 * The rent this tenant actually owes each month: whatever was decided at
 * onboarding (or edited since) on their own record, never recomputed from
 * the room. `rentAmount` is kept in sync with the room's per-bed share (or
 * full amount) whenever they're assigned a bed, but that's only ever a
 * starting suggestion - onboarding/edit can override it to a negotiated
 * figure, and the room's own rent changing afterward shouldn't silently
 * move an already-agreed number. `rentOverride` is a further, explicit pin
 * on top of that (kept for charge-level settlements elsewhere).
 */
export function effectiveRent(tenant: TenantForRent): number {
  if (tenant.rentOverride !== null && tenant.rentOverride !== undefined) {
    return num(tenant.rentOverride);
  }
  return num(tenant.rentAmount);
}

export type ChargeLike = {
  amount: Money;
  waived: boolean;
  allocations: { amount: Money }[];
};

export function chargePaid(charge: ChargeLike) {
  return round2(charge.allocations.reduce((sum, a) => sum + num(a.amount), 0));
}

/** What is still owed on a charge. A waived charge owes nothing. */
export function chargeOutstanding(charge: ChargeLike) {
  if (charge.waived) return 0;
  return round2(num(charge.amount) - chargePaid(charge));
}

export function isPartlyPaid(charge: ChargeLike) {
  const paid = chargePaid(charge);
  return paid > 0 && paid < num(charge.amount) && !charge.waived;
}

export type ChargeSummaryRow = { billed: number; paid: number; outstanding: number };

export type ChargeSummary = {
  byType: Record<ChargeType, ChargeSummaryRow>;
  total: ChargeSummaryRow;
  overdue: number;
};

const EMPTY_ROW = (): ChargeSummaryRow => ({ billed: 0, paid: 0, outstanding: 0 });

/**
 * Roll a tenant's charges up into per-type and overall totals: the shape the
 * tenant card, the dues tab, and the reminder message all need.
 */
export function summariseCharges(
  charges: (ChargeLike & { type: ChargeType; dueDate: Date | string })[],
  asOf: Date = new Date()
): ChargeSummary {
  const byType = {
    RENT: EMPTY_ROW(),
    ELECTRICITY: EMPTY_ROW(),
    LAUNDRY: EMPTY_ROW(),
    OTHER: EMPTY_ROW(),
  } as Record<ChargeType, ChargeSummaryRow>;

  const total = EMPTY_ROW();
  let overdue = 0;

  for (const charge of charges) {
    const billed = charge.waived ? 0 : num(charge.amount);
    const paid = chargePaid(charge);
    const outstanding = chargeOutstanding(charge);

    const row = byType[charge.type];
    row.billed = round2(row.billed + billed);
    row.paid = round2(row.paid + paid);
    row.outstanding = round2(row.outstanding + outstanding);

    total.billed = round2(total.billed + billed);
    total.paid = round2(total.paid + paid);
    total.outstanding = round2(total.outstanding + outstanding);

    if (outstanding > 0 && new Date(charge.dueDate) < asOf) {
      overdue = round2(overdue + outstanding);
    }
  }

  return { byType, total, overdue };
}

export const AGING_BUCKETS = [
  { key: "1-7", label: "1-7 days", min: 1, max: 7, color: "var(--marigold)" },
  { key: "8-30", label: "8-30 days", min: 8, max: 30, color: "var(--chart-power)" },
  { key: "31-60", label: "31-60 days", min: 31, max: 60, color: "var(--ledger)" },
  { key: "60+", label: "60+ days", min: 61, max: Infinity, color: "var(--chart-other)" },
] as const;

/**
 * How much of everyone's outstanding balance has been late how long, bucketed
 * for the dues-aging chart (dashboard "Aging" tab, Ledger dues tab). A charge
 * not yet due (or paid off) contributes nothing.
 */
export function bucketDuesAging(
  charges: (ChargeLike & { dueDate: Date | string })[],
  today: string
): { key: string; label: string; amount: number; color: string }[] {
  const totals = new Map(AGING_BUCKETS.map((b) => [b.key, 0]));

  for (const charge of charges) {
    const outstanding = chargeOutstanding(charge);
    if (outstanding <= 0.005) continue;
    const due = new Date(charge.dueDate).toISOString().slice(0, 10);
    if (due >= today) continue;
    const daysLate = Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000);
    const bucket = AGING_BUCKETS.find((b) => daysLate >= b.min && daysLate <= b.max);
    if (bucket) totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + outstanding);
  }

  return AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, color: b.color, amount: round2(totals.get(b.key) ?? 0) }));
}

/**
 * Spread a payment across outstanding charges, oldest first.
 *
 * Returns the allocations to write plus whatever is left over. An overpayment
 * sits on the tenant's account as credit rather than being silently absorbed.
 */
export function planAllocations(
  amount: number,
  charges: (ChargeLike & { id: string })[]
): { allocations: { chargeId: string; amount: number }[]; unallocated: number } {
  let remaining = round2(amount);
  const allocations: { chargeId: string; amount: number }[] = [];

  for (const charge of charges) {
    if (remaining <= 0) break;
    const owed = chargeOutstanding(charge);
    if (owed <= 0) continue;

    const applied = round2(Math.min(owed, remaining));
    allocations.push({ chargeId: charge.id, amount: applied });
    remaining = round2(remaining - applied);
  }

  return { allocations, unallocated: remaining };
}

/** "2026-08" -> "August 2026" */
export function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/**
 * The financial year a period ("YYYY-MM") falls in, given the month (1-12)
 * it starts on. Returns the FY's first and last periods plus a label like
 * "Apr 2026 - Mar 2027" (or just "2026" when the FY starts in January).
 */
export function fiscalYearOf(period: string, startMonth: number) {
  const [year, month] = period.split("-").map(Number);
  const fyStartYear = month >= startMonth ? year : year - 1;
  const start = `${fyStartYear}-${String(startMonth).padStart(2, "0")}`;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? fyStartYear : fyStartYear + 1;
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}`;

  const shortLabel = (p: string) => {
    const [y, m] = p.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  };

  const label = startMonth === 1 ? `${fyStartYear}` : `${shortLabel(start)} - ${shortLabel(end)}`;
  return { start, end, label };
}

export function periodOf(date: Date | string) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/*
 * Billing runs on calendar months. Every helper below works in UTC calendar
 * terms, because a rent period is a date, not an instant: "August" is the
 * same August whether the server sits in UTC or IST.
 */

/** The period ("YYYY-MM") n months after the given one. Negative n goes back. */
export function addPeriods(period: string, n: number): string {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Every period from `from` to `to` inclusive, oldest first. Empty if `to` is
 * before `from`, or if either isn't a real "YYYY-MM": a malformed bound
 * (say, from an invalid date) must produce nothing, never a runaway list.
 */
export function periodsBetween(from: string, to: string): string[] {
  if (!PERIOD_RE.test(from) || !PERIOD_RE.test(to)) return [];
  const out: string[] = [];
  // 600 months is a defensive cap, not a real limit.
  for (let p = from, i = 0; p <= to && i < 600; p = addPeriods(p, 1), i++) out.push(p);
  return out;
}

/** Number of days in the period's month. */
export function daysInPeriod(period: string): number {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First day of the period, at UTC midnight: the due date of a full month's rent. */
export function periodStart(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Last day of the period, at UTC midnight. */
export function periodEnd(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0));
}

/** "YYYY-MM-DD" of a date's UTC calendar day. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type RentPeriodPlan = {
  period: string;
  amount: number;
  dueDate: Date;
  /** Days of the month actually being charged for (a full month charges every day of it). */
  days: number;
  /** Set only on the join month, when the charge covers part of the month. */
  partial: { from: Date; to: Date } | null;
};

/**
 * What a tenant owes in rent for one calendar month.
 *
 * The month they move in is pro-rated: rent counts from the day *after* they
 * arrive through the end of the month (arrive on the 13th, pay for the
 * 14th-31st), by the month's actual number of days, and it falls due on the
 * join date itself. Every month after that is the full amount, due on the
 * 1st. Joining on the 1st is a full month, there's nothing to pro-rate.
 */
export function rentForPeriod(monthlyRent: number, joinDate: Date | string, period: string): RentPeriodPlan {
  const join = new Date(joinDate);
  const totalDays = daysInPeriod(period);
  const joinPeriod = periodOf(join);

  if (joinPeriod !== period || join.getUTCDate() === 1) {
    return { period, amount: round2(monthlyRent), dueDate: periodStart(period), days: totalDays, partial: null };
  }

  const firstChargedDay = join.getUTCDate() + 1;
  const days = Math.max(0, totalDays - join.getUTCDate());
  const from = new Date(Date.UTC(join.getUTCFullYear(), join.getUTCMonth(), Math.min(firstChargedDay, totalDays)));
  return {
    period,
    amount: round2((monthlyRent * days) / totalDays),
    dueDate: new Date(Date.UTC(join.getUTCFullYear(), join.getUTCMonth(), join.getUTCDate())),
    days,
    partial: { from, to: periodEnd(period) },
  };
}

/**
 * Every rent period a tenant should have a charge for, as of `asOf`, looking
 * `leadDays` ahead so next month's rent is on the books before the 1st.
 *
 * Runs from the join month (pro-rated) up to whichever month contains
 * `asOf + leadDays`, skipping anything already billed. A tenant entered in
 * August who has actually lived here since April comes back with every month
 * from April onward, so the owner can settle them one by one.
 */
export function pendingRentPeriods(
  monthlyRent: number,
  joinDate: Date | string,
  asOf: Date,
  leadDays: number,
  alreadyBilledPeriods: Set<string>
): RentPeriodPlan[] {
  // A missing or malformed lead (an undefined setting, say) means "no lead",
  // never "every month forever".
  const lead = Number.isFinite(leadDays) ? Math.max(0, leadDays) : 0;
  const join = new Date(joinDate);
  if (Number.isNaN(join.getTime()) || Number.isNaN(asOf.getTime())) return [];
  const horizon = new Date(asOf.getTime() + lead * 86400000);
  const from = periodOf(join);
  const to = periodOf(horizon);
  if (to < from) return [];
  return periodsBetween(from, to)
    .filter((p) => !alreadyBilledPeriods.has(p))
    .map((p) => rentForPeriod(monthlyRent, joinDate, p))
    .filter((plan) => plan.amount > 0);
}

/** "14 Aug - 31 Aug" style label for a pro-rated stretch, for charge descriptions. */
export function dayRangeLabel(from: Date, to: Date): string {
  const f = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(from)} - ${f(to)}`;
}

/** Whether two dates fall on the same UTC calendar day. */
export function sameUtcDay(a: Date | string, b: Date | string): boolean {
  return utcDay(new Date(a)) === utcDay(new Date(b));
}

/**
 * Split a total proportionally by weight instead of evenly, still exact to
 * the paisa: splitEvenly is the special case where every weight is equal.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || sum <= 0) return weights.map(() => 0);

  const paise = Math.round(total * 100);
  const raw = weights.map((w) => (paise * w) / sum);
  const base = raw.map((r) => Math.trunc(r));
  let remainder = paise - base.reduce((a, b) => a + b, 0);
  const sign = remainder < 0 ? -1 : 1;
  remainder = Math.abs(remainder);

  const byFraction = raw
    .map((r, i) => ({ i, frac: Math.abs(r - Math.trunc(r)) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...base];
  for (let k = 0; k < remainder; k++) result[byFraction[k % byFraction.length].i] += sign;
  return result.map((v) => v / 100);
}

/**
 * How much of a room's electricity bill each current occupant owes, weighted
 * by the days they were actually there within the reading period.
 *
 * Usage is assumed even across the period (the only assumption possible from
 * a start/end total), so each day's unit-share splits evenly between however
 * many occupants were present that day, and a tenant's weight is the sum of
 * their share across every day they lived there. Someone who joined partway
 * through pays only for the days since they moved in, and days before anyone
 * else arrives are billed in full to whoever was already there.
 */
export function roomOccupantWeights(
  occupants: { id: string; joinDate: Date | string }[],
  periodStart: Date | string,
  periodEnd: Date | string
): Map<string, number> {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  const effectiveJoin = (o: { joinDate: Date | string }) => Math.max(new Date(o.joinDate).getTime(), start);

  const boundaries = new Set<number>([start, end]);
  for (const o of occupants) {
    const j = effectiveJoin(o);
    if (j > start && j < end) boundaries.add(j);
  }
  const points = [...boundaries].sort((a, b) => a - b);

  const weights = new Map<string, number>(occupants.map((o) => [o.id, 0]));
  for (let i = 0; i < points.length - 1; i++) {
    const segStart = points[i];
    const segDays = (points[i + 1] - segStart) / 86400000;
    if (segDays <= 0) continue;

    const present = occupants.filter((o) => effectiveJoin(o) <= segStart);
    if (present.length === 0) continue;

    const share = segDays / present.length;
    for (const o of present) weights.set(o.id, (weights.get(o.id) ?? 0) + share);
  }
  return weights;
}

/**
 * "August 2026, September 2026" - the distinct months a single payment's
 * allocations touch, deduped and in order. A payment touching more than one
 * month is an advance, not a plain settle-the-one-bill-it-was-for payment.
 */
export function coveredPeriodsLabel(periods: string[]): string {
  return Array.from(new Set(periods)).sort().map(periodLabel).join(", ");
}

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  LAUNDRY: "Laundry",
  OTHER: "Other",
};
