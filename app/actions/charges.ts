"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import {
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  effectiveRent,
  num,
  pendingRentCycles,
  periodLabel,
  periodOf,
  planAllocations,
  proratedRent,
  roomOccupantWeights,
  splitByWeights,
  summariseCharges,
  type Money,
  type RoomForSplit,
} from "@/lib/charges";
import type { ChargeType } from "@/lib/generated/prisma/enums";

const CHARGES_WITH_PAYMENTS = {
  allocations: { select: { amount: true, ledgerEntry: { select: { date: true } } } },
} as const;

function revalidateMoneyViews(tenantId?: string) {
  revalidatePath("/");
  revalidatePath("/ledger");
  revalidatePath("/reminders");
  if (tenantId) revalidatePath(`/tenants/${tenantId}`);
}

/** Every charge for a tenant, newest first, with what has been paid against it. */
export async function listChargesForTenant(tenantId: string) {
  return prisma.charge.findMany({
    where: { tenantId },
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    include: CHARGES_WITH_PAYMENTS,
  });
}

/** Everyone who owes something, with their charges: the Dues tab. */
export async function listOutstandingByTenant() {
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      room: { select: { id: true, number: true, floor: { select: { name: true } } } },
      charges: { orderBy: { dueDate: "asc" }, include: CHARGES_WITH_PAYMENTS },
    },
  });

  return tenants
    .map((tenant) => ({ tenant, summary: summariseCharges(tenant.charges) }))
    .filter((row) => row.summary.total.outstanding > 0.005);
}

type TenantForBilling = {
  id: string;
  joinDate: Date;
  rentCycleAnchor?: Date | null;
  rentAmount: Money;
  rentOverride?: Money | null;
  room?: RoomForSplit | null;
};

/**
 * Every rent-charge row a tenant is due for, as of `asOf`, that isn't already
 * in `alreadyBilledPeriods`. Shared by the nightly catch-up (many tenants,
 * asOf = now) and onboarding (one tenant, asOf = their own join date, so only
 * their very first cycle comes back).
 *
 * Cycles run from rentCycleAnchor when set, joinDate otherwise: a tenant who
 * moved into an already-occupied room has their cycle anchored to the day
 * their first (pro-rated) charge synced up with their roommate's, not to
 * their own move-in date.
 */
function buildPendingRentChargeRows(
  tenant: TenantForBilling,
  asOf: Date,
  alreadyBilledPeriods: Set<string>,
  actor: string
) {
  const amount = effectiveRent(tenant);
  if (amount <= 0) return [];

  const anchor = tenant.rentCycleAnchor ?? tenant.joinDate;
  return pendingRentCycles(anchor, asOf, alreadyBilledPeriods).map(({ start, period }) => ({
    tenantId: tenant.id,
    type: "RENT" as const,
    period,
    description: `Rent · ${periodLabel(period)}`,
    amount,
    dueDate: start,
    createdBy: actor,
  }));
}

/**
 * Create every rent charge that's come due and doesn't exist yet, for every
 * active tenant. Cycle boundaries are each tenant's own join-date
 * anniversary, not a shared calendar day, so someone who joined on the 5th
 * is always due on the 5th regardless of when anyone else joined.
 *
 * Safe to run repeatedly, including concurrently: the unique
 * (tenantId, period, type) constraint on Charge means a cycle already billed
 * is silently skipped via skipDuplicates rather than double-billed.
 */
export async function generateDueRentCharges(actor: string, asOf: Date = new Date()) {
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    include: {
      room: true,
      charges: { where: { type: "RENT" }, select: { period: true } },
    },
  });

  const rows = tenants.flatMap((tenant) =>
    buildPendingRentChargeRows(tenant, asOf, new Set(tenant.charges.map((c) => c.period)), actor)
  );

  if (rows.length === 0) return { created: 0 };

  const result = await prisma.charge.createMany({ data: rows, skipDuplicates: true });
  if (result.count > 0) {
    const tenantCount = new Set(rows.map((r) => r.tenantId)).size;
    await logActivity(actor, "Rent charges generated", `${result.count} charge(s) across ${tenantCount} tenant(s)`);
    revalidateMoneyViews();
  }

  return { created: result.count };
}

/**
 * A newly onboarded tenant's very first rent charge, dated to their join
 * date. Everything after this comes from the nightly catch-up; this just
 * means a tenant isn't sitting at ₹0 owed for up to a day after they move in.
 */
export async function generateFirstRentCharge(actor: string, tenant: TenantForBilling) {
  const rows = buildPendingRentChargeRows(tenant, tenant.joinDate, new Set(), actor);
  if (rows.length === 0) return;
  await prisma.charge.createMany({ data: rows, skipDuplicates: true });
}

/**
 * A tenant moving into a room that already has someone in it doesn't start
 * their own cycle: their first charge covers only the days until the
 * existing roommate's next due-day, so the room settles onto one shared due
 * date instead of two. Returns the sync date the tenant's rentCycleAnchor
 * should be set to, so every cycle after this one lands on it automatically.
 */
export async function generateSyncedFirstRentCharge(
  actor: string,
  tenant: { id: string; joinDate: Date; rentAmount: Money },
  syncDate: Date
) {
  const days = Math.round((syncDate.getTime() - tenant.joinDate.getTime()) / 86400000);
  const amount = proratedRent(num(tenant.rentAmount), days);
  if (amount > 0) {
    const period = periodOf(tenant.joinDate);
    await prisma.charge.createMany({
      data: [
        {
          tenantId: tenant.id,
          type: "RENT",
          period,
          description: `Rent · ${periodLabel(period)} (partial, synced to room)`,
          amount,
          dueDate: tenant.joinDate,
          createdBy: actor,
        },
      ],
      skipDuplicates: true,
    });
  }
}

/**
 * Turn a room's meter reading into one charge per occupant.
 *
 * The owner reads the meter once; whoever is living in the room at that moment
 * splits it. Shares are computed so they add back up to the bill exactly.
 */
export async function billRoomElectricity(actor: string, billId: string) {
  const bill = await prisma.electricityBill.findUnique({
    where: { id: billId },
    include: {
      room: { include: { tenants: { where: { status: "ACTIVE" }, orderBy: { name: "asc" } } } },
    },
  });

  // Only a closed reading has a real amount to split; an open one (started
  // at onboarding, no current number yet) isn't billable.
  if (!bill || bill.isMainMeter || !bill.endDate || bill.amount === null || bill.units === null) {
    return { created: 0 };
  }
  // Narrowed once here since the await below (a real gap, not just more
  // code) is enough for TS to stop trusting the guard above by the time the
  // closure runs.
  const endDate = bill.endDate;
  const billAmount = Number(bill.amount);
  const billUnits = Number(bill.units);

  // Legacy readings recorded straight against a tenant bill only that tenant.
  const occupants = bill.room
    ? bill.room.tenants
    : bill.tenantId
      ? await prisma.tenant.findMany({ where: { id: bill.tenantId } })
      : [];

  if (occupants.length === 0) return { created: 0 };

  const period = periodOf(endDate);
  // Weighted by days actually lived there within this reading's window, so
  // someone who moved in partway through only pays for the days since, and
  // whoever was already there isn't stuck splitting evenly from a date
  // before the newcomer existed.
  const weights = roomOccupantWeights(occupants, bill.startDate, endDate);
  const shares = splitByWeights(
    billAmount,
    occupants.map((o) => weights.get(o.id) ?? 0)
  );
  const units = billUnits;
  const roomLabel = bill.room ? `Room ${bill.room.number}` : "Room";

  await prisma.charge.createMany({
    data: occupants.map((tenant, i) => ({
      tenantId: tenant.id,
      type: "ELECTRICITY" as const,
      period,
      description:
        occupants.length > 1
          ? `Electricity · ${roomLabel} · ${units} units split ${occupants.length} ways`
          : `Electricity · ${roomLabel} · ${units} units`,
      amount: shares[i],
      dueDate: endDate,
      sourceBillId: bill.id,
      createdBy: actor,
    })),
  });

  await logActivity(
    actor,
    "Electricity billed",
    `${roomLabel} · ${units} units · ₹${Number(bill.amount)} across ${occupants.length}`
  );
  for (const tenant of occupants) revalidateMoneyViews(tenant.id);

  return { created: occupants.length };
}

export async function addManualCharge(
  actor: string,
  input: { tenantId: string; type: ChargeType; description: string; amount: number; dueDate: string }
) {
  const charge = await prisma.charge.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      period: periodOf(input.dueDate),
      description: input.description || CHARGE_TYPE_LABELS[input.type],
      amount: input.amount,
      dueDate: new Date(input.dueDate),
      createdBy: actor,
    },
    include: { tenant: { select: { name: true } } },
  });

  await logActivity(actor, "Charge added", `${charge.tenant.name} · ${charge.description} · ₹${input.amount}`);
  revalidateMoneyViews(input.tenantId);
  return charge;
}

export async function waiveCharge(actor: string, id: string, waived: boolean) {
  const charge = await prisma.charge.update({
    where: { id },
    data: { waived },
    include: { tenant: { select: { name: true } } },
  });
  await logActivity(actor, waived ? "Charge waived" : "Waiver removed", `${charge.tenant.name} · ${charge.description}`);
  revalidateMoneyViews(charge.tenantId);
}

export async function deleteCharge(actor: string, id: string) {
  const charge = await prisma.charge.delete({ where: { id } });
  await logActivity(actor, "Charge deleted", charge.description);
  revalidateMoneyViews(charge.tenantId);
}

/**
 * Match money received against what a tenant owes, oldest bill first.
 *
 * Anything above the outstanding total stays unallocated and shows up as
 * credit on their account instead of disappearing.
 */
export async function allocatePaymentToCharges(ledgerEntryId: string, tenantId: string, amount: number) {
  const open = await prisma.charge.findMany({
    where: { tenantId, waived: false },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: CHARGES_WITH_PAYMENTS,
  });

  const { allocations, unallocated } = planAllocations(amount, open);
  if (allocations.length > 0) {
    await prisma.allocation.createMany({
      data: allocations.map((a) => ({ ...a, ledgerEntryId })),
    });
  }

  return { applied: allocations.length, unallocated };
}

/** Rebuild every allocation for a tenant, used after a charge or payment is removed. */
export async function reallocateTenant(tenantId: string) {
  const [payments, charges] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { tenantId, type: { in: ["RENT", "OTHER"] } },
      orderBy: { date: "asc" },
    }),
    prisma.charge.findMany({
      where: { tenantId, waived: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: CHARGES_WITH_PAYMENTS,
    }),
  ]);

  await prisma.allocation.deleteMany({ where: { ledgerEntry: { tenantId } } });

  // Replay payments in date order against a running tally of what's owed.
  const running = charges.map((c) => ({ ...c, allocations: [] as { amount: number }[] }));
  const toWrite: { chargeId: string; ledgerEntryId: string; amount: number }[] = [];

  for (const payment of payments) {
    const { allocations } = planAllocations(Number(payment.amount), running);
    for (const a of allocations) {
      toWrite.push({ ...a, ledgerEntryId: payment.id });
      running.find((c) => c.id === a.chargeId)?.allocations.push({ amount: a.amount });
    }
  }

  if (toWrite.length > 0) await prisma.allocation.createMany({ data: toWrite });
  return toWrite.length;
}

/** What a tenant owes right now, split by type. Powers reminders and checkout. */
export async function getTenantDues(tenantId: string) {
  const charges = await prisma.charge.findMany({
    where: { tenantId },
    orderBy: { dueDate: "asc" },
    include: CHARGES_WITH_PAYMENTS,
  });

  return {
    summary: summariseCharges(charges),
    open: charges.filter((c) => chargeOutstanding(c) > 0.005),
  };
}
