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
  room?: RoomForSplit | null;
};

/**
 * The rent this tenant actually owes each month.
 *
 * A per-tenant override always wins. Otherwise it's the room's per-bed rate.
 * A tenant with no room, or a room with no rent set, falls back to the
 * amount on their own record, which is how every tenant worked before rooms
 * existed.
 */
export function effectiveRent(tenant: TenantForRent): number {
  if (tenant.rentOverride !== null && tenant.rentOverride !== undefined) {
    return num(tenant.rentOverride);
  }

  const room = tenant.room;
  if (!room || num(room.rentAmount) <= 0) return num(tenant.rentAmount);

  return rentShare(room);
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

export function periodOf(date: Date | string) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Add n calendar months to a date, anchored to its day-of-month and clamped
 * to the target month's last day when it doesn't have that many days.
 *
 * Built at UTC midnight for the same reason the old dueDateFor was: a rent
 * due date is a calendar date, and computing it in server-local time can
 * land it on the wrong day once server and property are in different zones.
 * This also avoids the native `Date.setMonth` rollover bug: Jan 31 plus one
 * month becomes "Mar 3" via setMonth (Feb only has 28 days), not Feb 28.
 */
export function addCalendarMonths(date: Date | string, n: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  const targetFirst = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDayOfTarget = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(day, lastDayOfTarget)));
}

/**
 * Every monthly rent cycle for a tenant that has started on or before `asOf`
 * and doesn't already have a charge, oldest first.
 *
 * Cycle 0 starts on joinDate itself (rent is paid in advance, the same day
 * you move in), and cycle N starts N months later, on the same day-of-month
 * the tenant joined on. A tenant who joined the 5th is always due the 5th,
 * regardless of what day anyone else in the building joined on.
 */
export function pendingRentCycles(
  joinDate: Date | string,
  asOf: Date,
  alreadyBilledPeriods: Set<string>
): { start: Date; period: string }[] {
  const cycles: { start: Date; period: string }[] = [];
  // 600 months (50 years) is a defensive cap, not a real limit; nothing
  // reasonable should ever get close to it.
  for (let n = 0; n < 600; n++) {
    const start = addCalendarMonths(joinDate, n);
    if (start > asOf) break;
    const period = periodOf(start);
    if (!alreadyBilledPeriods.has(period)) cycles.push({ start, period });
  }
  return cycles;
}

/**
 * The next date on or after `after` that falls on the same day-of-month as
 * `anchor`, clamped for short months the same way addCalendarMonths is.
 *
 * How a new roommate's first cycle lands on an existing roommate's due-day:
 * find where that day next occurs after the new tenant's join date.
 */
export function nextAnchorOccurrence(anchor: Date | string, after: Date | string): Date {
  const anchorDay = new Date(anchor).getUTCDate();
  const afterDate = new Date(after);
  const thisMonth = new Date(Date.UTC(afterDate.getUTCFullYear(), afterDate.getUTCMonth(), 1));
  const lastDayThisMonth = new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const candidate = new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth(), Math.min(anchorDay, lastDayThisMonth)));
  return candidate > afterDate ? candidate : addCalendarMonths(candidate, 1);
}

/** A monthly amount pro-rated over a flat 30-day month, the same convention as the example this was built from. */
export function proratedRent(monthlyRent: number, days: number): number {
  return round2((monthlyRent / 30) * Math.max(days, 0));
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

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  LAUNDRY: "Laundry",
  OTHER: "Other",
};
