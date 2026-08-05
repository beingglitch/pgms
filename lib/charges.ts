import type { ChargeType, SplitMode } from "@/lib/generated/prisma/enums";

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

/** Room setting wins, then the floor's, then the property-wide default. */
export function resolveSplitMode(
  room: { splitMode: SplitMode | null; floor?: { splitMode: SplitMode | null } | null } | null | undefined,
  propertyDefault: SplitMode
): SplitMode {
  return room?.splitMode ?? room?.floor?.splitMode ?? propertyDefault;
}

export type RoomForSplit = {
  rentAmount: Money;
  capacity: number;
  splitMode: SplitMode | null;
  floor?: { splitMode: SplitMode | null } | null;
};

/**
 * What one bed in a room costs.
 *
 * BY_CAPACITY divides by the number of beds, so each tenant pays the same
 * whether or not the room is full and an empty bed is the owner's loss.
 * BY_OCCUPANTS divides by who is actually living there, so the room always
 * earns its full rent and the people in it absorb a vacancy.
 */
export function rentShare(room: RoomForSplit, occupants: number, propertyDefault: SplitMode): number {
  const roomRent = num(room.rentAmount);
  const mode = resolveSplitMode(room, propertyDefault);

  if (mode === "BY_OCCUPANTS") {
    return occupants > 0 ? round2(roomRent / occupants) : roomRent;
  }
  return room.capacity > 0 ? round2(roomRent / room.capacity) : roomRent;
}

export type TenantForRent = {
  rentAmount: Money;
  rentOverride?: Money | null;
  room?: (RoomForSplit & { tenants?: { id: string }[] }) | null;
};

/**
 * The rent this tenant actually owes each month.
 *
 * A per-tenant override always wins. Otherwise the room's rent is split. A
 * tenant with no room, or a room with no rent set, falls back to the amount
 * on their own record, which is how every tenant worked before rooms existed.
 */
export function effectiveRent(
  tenant: TenantForRent,
  propertyDefault: SplitMode,
  occupantCount?: number
): number {
  if (tenant.rentOverride !== null && tenant.rentOverride !== undefined) {
    return num(tenant.rentOverride);
  }

  const room = tenant.room;
  if (!room || num(room.rentAmount) <= 0) return num(tenant.rentAmount);
  if (resolveSplitMode(room, propertyDefault) === "CUSTOM") return num(tenant.rentAmount);

  const occupants = occupantCount ?? room.tenants?.length ?? room.capacity;
  return rentShare(room, occupants, propertyDefault);
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
 * The date rent falls due in a given period, clamped to short months.
 *
 * Built at UTC midnight: a due date is a calendar date, and constructing it in
 * server-local time makes it land on the previous day once the server and the
 * property are in different zones.
 */
export function dueDateFor(period: string, rentDueDay: number) {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(rentDueDay, 1), lastDay)));
}

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  LAUNDRY: "Laundry",
  OTHER: "Other",
};
