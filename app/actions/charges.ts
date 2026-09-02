"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireAccountId } from "./auth";
import {
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  dayRangeLabel,
  effectiveRent,
  num,
  pendingRentPeriods,
  periodLabel,
  periodOf,
  planAllocations,
  round2,
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
  const accountId = await requireAccountId();
  return prisma.charge.findMany({
    where: { tenantId, accountId },
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    include: CHARGES_WITH_PAYMENTS,
  });
}

/**
 * Every charge ever raised, whoever it's for and whether or not it's been
 * paid - the full billing register behind "of ₹X billed", so it can be
 * browsed by month or by tenant rather than just taken on faith.
 */
export async function listAllCharges() {
  const accountId = await requireAccountId();
  return prisma.charge.findMany({
    where: { accountId },
    orderBy: [{ period: "desc" }, { dueDate: "desc" }],
    include: {
      ...CHARGES_WITH_PAYMENTS,
      tenant: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
          roomNumber: true,
          room: { select: { number: true, floor: { select: { name: true } } } },
        },
      },
    },
  });
}

/** Everyone who owes something, with their charges: the Dues tab. */
export async function listOutstandingByTenant() {
  const accountId = await requireAccountId();
  const tenants = await prisma.tenant.findMany({
    where: { accountId, status: "ACTIVE" },
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
  room?: RoomForSplit | null;
};

/**
 * Every rent-charge row a tenant is missing, as of `asOf`, looking `leadDays`
 * ahead. One row per calendar month from their join month (pro-rated) up to
 * the month `leadDays` from now, minus anything already billed.
 */
function buildPendingRentChargeRows(
  tenant: TenantForBilling,
  asOf: Date,
  leadDays: number,
  alreadyBilledPeriods: Set<string>,
  actor: string
) {
  const monthly = effectiveRent(tenant);
  if (monthly <= 0) return [];

  return pendingRentPeriods(monthly, tenant.joinDate, asOf, leadDays, alreadyBilledPeriods).map((plan) => ({
    tenantId: tenant.id,
    type: "RENT" as const,
    period: plan.period,
    description: plan.partial
      ? `Rent · ${periodLabel(plan.period)} (${dayRangeLabel(plan.partial.from, plan.partial.to)}, ${plan.days} days)`
      : `Rent · ${periodLabel(plan.period)}`,
    amount: plan.amount,
    dueDate: plan.dueDate,
    createdBy: actor,
  }));
}

/**
 * Create every rent charge that's due (or due within the Settings lead
 * window) and doesn't exist yet, for every active tenant of one account.
 * Rent is a calendar month: the join month pro-rated from the day after
 * arrival, every month after that in full and due on the 1st, put on the
 * books `dueLeadDays` (Settings, default 7) before it.
 *
 * Takes `accountId` explicitly rather than resolving it from the session,
 * since the daily cron calls this once per account with no session of its
 * own to read. Safe to run repeatedly, including concurrently: the partial
 * unique index on (tenantId, period) for RENT means a month already billed
 * is skipped via skipDuplicates rather than double-billed. Pass
 * `revalidate: false` when calling during a render, where revalidatePath
 * isn't allowed.
 */
export async function generateDueRentCharges(
  accountId: string,
  actor: string,
  opts: { asOf?: Date; revalidate?: boolean } = {}
) {
  const asOf = opts.asOf ?? new Date();
  const [tenants, pgInfo] = await Promise.all([
    prisma.tenant.findMany({
      where: { accountId, status: "ACTIVE" },
      include: {
        room: true,
        charges: { where: { type: "RENT" }, select: { period: true } },
      },
    }),
    prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { dueLeadDays: true } }),
  ]);

  const rows = tenants.flatMap((tenant) =>
    buildPendingRentChargeRows(tenant, asOf, pgInfo.dueLeadDays, new Set(tenant.charges.map((c) => c.period)), actor).map(
      (row) => ({ ...row, accountId })
    )
  );

  if (rows.length === 0) return { created: 0 };

  const result = await prisma.charge.createMany({ data: rows, skipDuplicates: true });
  if (result.count > 0) {
    const tenantCount = new Set(rows.map((r) => r.tenantId)).size;
    await logActivity(accountId, actor, "Rent charges generated", `${result.count} charge(s) across ${tenantCount} tenant(s)`);
    if (opts.revalidate !== false) revalidateMoneyViews();
  }

  return { created: result.count };
}

/**
 * Turn a room's meter reading into one charge per occupant.
 *
 * The owner reads the meter once; whoever is living in the room at that moment
 * splits it. Shares are computed so they add back up to the bill exactly.
 */
export async function billRoomElectricity(accountId: string, actor: string, billId: string) {
  const bill = await prisma.electricityBill.findFirst({
    where: { id: billId, accountId },
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
      ? await prisma.tenant.findMany({ where: { id: bill.tenantId, accountId } })
      : [];

  if (occupants.length === 0) return { created: 0 };

  // Attributed to the month the reading *started* in: a reading closed on
  // the 1st (or a few days late) is still last month's electricity.
  const period = periodOf(bill.startDate);
  // Weighted by days actually lived there within this reading's window, so
  // someone who moved in partway through only pays for the days since, and
  // whoever was already there isn't stuck splitting evenly from a date
  // before the newcomer existed. A tenant with no days in the window (one
  // who arrived the day it closed) gets no charge at all.
  const weights = roomOccupantWeights(occupants, bill.startDate, endDate);
  const billed = occupants.filter((o) => (weights.get(o.id) ?? 0) > 0);
  if (billed.length === 0) return { created: 0 };
  const shares = splitByWeights(
    billAmount,
    billed.map((o) => weights.get(o.id) ?? 0)
  );
  const units = billUnits;
  const roomLabel = bill.room ? `Room ${bill.room.number}` : "Room";
  const range = dayRangeLabel(bill.startDate, endDate);

  await prisma.charge.createMany({
    data: billed.map((tenant, i) => ({
      accountId,
      tenantId: tenant.id,
      type: "ELECTRICITY" as const,
      period,
      description:
        billed.length > 1
          ? `Electricity · ${roomLabel} · ${range} · ${units} units split ${billed.length} ways`
          : `Electricity · ${roomLabel} · ${range} · ${units} units`,
      amount: shares[i],
      dueDate: endDate,
      sourceBillId: bill.id,
      createdBy: actor,
    })),
  });

  await logActivity(
    accountId,
    actor,
    "Electricity billed",
    `${roomLabel} · ${range} · ${units} units · ₹${Number(bill.amount)} across ${billed.length}`
  );
  for (const tenant of billed) revalidateMoneyViews(tenant.id);

  return { created: billed.length };
}

export async function addManualCharge(
  actor: string,
  input: { tenantId: string; type: ChargeType; description: string; amount: number; dueDate: string }
) {
  const accountId = await requireAccountId();
  await prisma.tenant.findFirstOrThrow({ where: { id: input.tenantId, accountId } });

  const charge = await prisma.charge.create({
    data: {
      accountId,
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

  await logActivity(accountId, actor, "Charge added", `${charge.tenant.name} · ${charge.description} · ₹${input.amount}`);
  revalidateMoneyViews(input.tenantId);
  return charge;
}

export async function waiveCharge(actor: string, id: string, waived: boolean) {
  const accountId = await requireAccountId();
  await prisma.charge.findFirstOrThrow({ where: { id, accountId } });
  const charge = await prisma.charge.update({
    where: { id },
    data: { waived },
    include: { tenant: { select: { name: true } } },
  });
  await logActivity(accountId, actor, waived ? "Charge waived" : "Waiver removed", `${charge.tenant.name} · ${charge.description}`);
  revalidateMoneyViews(charge.tenantId);
}

/**
 * Change what a charge is actually for, e.g. rent billed at ₹8,333 (a
 * pro-rated month) but owner and tenant settle on a flat ₹8,000 - so the
 * charge reads ₹8,000 and closes out fully once that's paid, rather than
 * leaving ₹333 sitting outstanding forever. Can't go below what's already
 * been paid against it, that would leave the charge "overpaid" instead of
 * settled; waive or delete it if the whole thing should go away instead.
 */
export async function adjustChargeAmount(actor: string, id: string, newAmount: number, note?: string) {
  const accountId = await requireAccountId();
  const charge = await prisma.charge.findFirst({
    where: { id, accountId },
    include: { allocations: { select: { amount: true } }, tenant: { select: { name: true } } },
  });
  if (!charge) throw new Error("That charge no longer exists.");

  const paid = round2(charge.allocations.reduce((sum, a) => sum + num(a.amount), 0));
  if (newAmount < paid) {
    throw new Error(`₹${paid} has already been paid against this - the new amount can't be less than that.`);
  }

  const oldAmount = num(charge.amount);
  await prisma.charge.update({ where: { id }, data: { amount: newAmount } });

  await logActivity(
    accountId,
    actor,
    "Charge amount adjusted",
    `${charge.tenant.name} · ${charge.description} · ₹${oldAmount} → ₹${newAmount}${note ? ` (${note})` : ""}`
  );
  revalidateMoneyViews(charge.tenantId);
  return { oldAmount, newAmount };
}

export async function deleteCharge(actor: string, id: string) {
  const accountId = await requireAccountId();
  await prisma.charge.findFirstOrThrow({ where: { id, accountId } });
  const charge = await prisma.charge.delete({ where: { id } });
  await logActivity(accountId, actor, "Charge deleted", charge.description);
  revalidateMoneyViews(charge.tenantId);
}

/**
 * Match money received against what a tenant owes, oldest bill first.
 *
 * With `chargeId` set (the owner is paying off one specific month), that
 * charge is settled first and only the remainder, if any, flows to the
 * others oldest-first. Anything above the outstanding total stays
 * unallocated and shows up as credit on their account instead of
 * disappearing.
 */
export async function allocatePaymentToCharges(
  accountId: string,
  ledgerEntryId: string,
  tenantId: string,
  amount: number,
  chargeId?: string
) {
  const open = await prisma.charge.findMany({
    where: { tenantId, accountId, waived: false },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: CHARGES_WITH_PAYMENTS,
  });
  const ordered = chargeId ? [...open.filter((c) => c.id === chargeId), ...open.filter((c) => c.id !== chargeId)] : open;

  const { allocations, unallocated } = planAllocations(amount, ordered);
  if (allocations.length > 0) {
    await prisma.allocation.createMany({
      data: allocations.map((a) => ({ ...a, ledgerEntryId })),
    });
  }

  return { applied: allocations.length, unallocated };
}

/** Rebuild every allocation for a tenant, used after a charge or payment is removed. */
export async function reallocateTenant(accountId: string, tenantId: string) {
  const [payments, charges] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { tenantId, accountId, type: { in: ["RENT", "OTHER"] } },
      orderBy: { date: "asc" },
    }),
    prisma.charge.findMany({
      where: { tenantId, accountId, waived: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: CHARGES_WITH_PAYMENTS,
    }),
  ]);

  await prisma.allocation.deleteMany({ where: { ledgerEntry: { tenantId, accountId } } });

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
  const accountId = await requireAccountId();
  const charges = await prisma.charge.findMany({
    where: { tenantId, accountId },
    orderBy: { dueDate: "asc" },
    include: CHARGES_WITH_PAYMENTS,
  });

  return {
    summary: summariseCharges(charges),
    open: charges.filter((c) => chargeOutstanding(c) > 0.005),
  };
}
