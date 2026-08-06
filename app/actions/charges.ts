"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { getPgInfo } from "./settings";
import {
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  effectiveRent,
  pendingRentCycles,
  periodLabel,
  periodOf,
  planAllocations,
  splitEvenly,
  summariseCharges,
  type Money,
  type RoomForSplit,
} from "@/lib/charges";
import type { ChargeType, SplitMode } from "@/lib/generated/prisma/enums";

const CHARGES_WITH_PAYMENTS = {
  allocations: { select: { amount: true } },
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
  rentAmount: Money;
  rentOverride?: Money | null;
  room?: (RoomForSplit & { tenants?: { id: string }[] }) | null;
};

/**
 * Every rent-charge row a tenant is due for, as of `asOf`, that isn't already
 * in `alreadyBilledPeriods`. Shared by the nightly catch-up (many tenants,
 * asOf = now) and onboarding (one tenant, asOf = their own join date, so only
 * their very first cycle comes back).
 */
function buildPendingRentChargeRows(
  tenant: TenantForBilling,
  defaultSplitMode: SplitMode,
  asOf: Date,
  alreadyBilledPeriods: Set<string>,
  actor: string
) {
  const amount = effectiveRent(tenant, defaultSplitMode, tenant.room?.tenants?.length);
  if (amount <= 0) return [];

  return pendingRentCycles(tenant.joinDate, asOf, alreadyBilledPeriods).map(({ start, period }) => ({
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
  const pgInfo = await getPgInfo();
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    include: {
      room: {
        include: { floor: { select: { splitMode: true } }, tenants: { where: { status: "ACTIVE" }, select: { id: true } } },
      },
      charges: { where: { type: "RENT" }, select: { period: true } },
    },
  });

  const rows = tenants.flatMap((tenant) =>
    buildPendingRentChargeRows(
      tenant,
      pgInfo.defaultSplitMode,
      asOf,
      new Set(tenant.charges.map((c) => c.period)),
      actor
    )
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
  const pgInfo = await getPgInfo();
  const rows = buildPendingRentChargeRows(tenant, pgInfo.defaultSplitMode, tenant.joinDate, new Set(), actor);
  if (rows.length === 0) return;
  await prisma.charge.createMany({ data: rows, skipDuplicates: true });
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
  const shares = splitEvenly(billAmount, occupants.length);
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
