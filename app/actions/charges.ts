"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { getPgInfo } from "./settings";
import {
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  dueDateFor,
  effectiveRent,
  periodLabel,
  periodOf,
  planAllocations,
  splitEvenly,
  summariseCharges,
} from "@/lib/charges";
import type { ChargeType } from "@/lib/generated/prisma/enums";

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

/** Everyone who owes something, with their charges — the Dues tab. */
export async function listOutstandingByTenant() {
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      room: { select: { number: true, floor: { select: { name: true } } } },
      charges: { orderBy: { dueDate: "asc" }, include: CHARGES_WITH_PAYMENTS },
    },
  });

  return tenants
    .map((tenant) => ({ tenant, summary: summariseCharges(tenant.charges) }))
    .filter((row) => row.summary.total.outstanding > 0.005);
}

/**
 * Raise this month's rent for everyone who doesn't already have it.
 *
 * Safe to run repeatedly — a tenant who already has a rent charge for the
 * period is skipped, so a second click never double-bills anyone.
 */
export async function generateRentCharges(actor: string, period?: string) {
  const pgInfo = await getPgInfo();
  const targetPeriod = period ?? periodOf(new Date());
  const dueDate = dueDateFor(targetPeriod, pgInfo.rentDueDay);

  const [tenants, existing] = await Promise.all([
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      include: { room: { include: { floor: { select: { splitMode: true } }, tenants: { where: { status: "ACTIVE" }, select: { id: true } } } } },
    }),
    prisma.charge.findMany({ where: { type: "RENT", period: targetPeriod }, select: { tenantId: true } }),
  ]);

  const alreadyBilled = new Set(existing.map((c) => c.tenantId));
  const label = periodLabel(targetPeriod);

  const rows = tenants
    .filter((t) => !alreadyBilled.has(t.id))
    // Don't bill someone for a month that starts before they moved in.
    .filter((t) => periodOf(t.joinDate) <= targetPeriod)
    .map((tenant) => ({
      tenantId: tenant.id,
      type: "RENT" as const,
      period: targetPeriod,
      description: `Rent · ${label}`,
      amount: effectiveRent(tenant, pgInfo.defaultSplitMode, tenant.room?.tenants.length),
      dueDate,
      createdBy: actor,
    }))
    .filter((row) => row.amount > 0);

  if (rows.length === 0) return { created: 0, period: targetPeriod };

  await prisma.charge.createMany({ data: rows });
  await logActivity(actor, "Rent raised", `${rows.length} tenant(s) · ${label}`);
  revalidateMoneyViews();

  return { created: rows.length, period: targetPeriod };
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

  if (!bill || bill.isMainMeter) return { created: 0 };

  // Legacy readings recorded straight against a tenant bill only that tenant.
  const occupants = bill.room
    ? bill.room.tenants
    : bill.tenantId
      ? await prisma.tenant.findMany({ where: { id: bill.tenantId } })
      : [];

  if (occupants.length === 0) return { created: 0 };

  const period = periodOf(bill.endDate);
  const shares = splitEvenly(Number(bill.amount), occupants.length);
  const units = Number(bill.units);
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
      dueDate: bill.endDate,
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

/** Rebuild every allocation for a tenant — used after a charge or payment is removed. */
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

/** What a tenant owes right now, split by type — powers reminders and checkout. */
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
