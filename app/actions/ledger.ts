"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { allocatePaymentToCharges, reallocateTenant } from "./charges";
import { num, periodOf } from "@/lib/charges";

/**
 * Prisma's Decimal isn't a plain object, so it can't cross the Server
 * Component / Server Action boundary to client code as-is (the dev overlay
 * flags it as a console error; a production RSC build would throw). Both
 * the top-level amount and each allocation's amount need converting.
 */
function serialiseEntry<T extends { amount: unknown; allocations: { amount: unknown }[] }>(entry: T) {
  return {
    ...entry,
    amount: num(entry.amount as never),
    allocations: entry.allocations.map((a) => ({ ...a, amount: num(a.amount as never) })),
  };
}

export async function listLedger() {
  const entries = await prisma.ledgerEntry.findMany({
    orderBy: { date: "desc" },
    include: {
      tenant: { select: { id: true, name: true, photoUrl: true, roomNumber: true } },
      allocations: { include: { charge: { select: { type: true, description: true, period: true } } } },
    },
  });
  return entries.map(serialiseEntry);
}

export async function getLedgerEntry(id: string) {
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id },
    include: {
      tenant: true,
      allocations: { include: { charge: { select: { type: true, description: true, period: true } } } },
    },
  });
  return entry ? serialiseEntry(entry) : null;
}

/**
 * Receipts are numbered per month, like R-202608-0004, so the sequence resets
 * each month and stays short enough to read out over the phone.
 */
async function nextReceiptNo(date: Date) {
  const period = periodOf(date).replace("-", "");
  const used = await prisma.ledgerEntry.count({ where: { receiptNo: { startsWith: `R-${period}-` } } });
  return `R-${period}-${String(used + 1).padStart(4, "0")}`;
}

export async function addLedgerEntry(
  actor: string,
  input: {
    tenantId: string;
    type: "RENT" | "DEPOSIT" | "REFUND" | "OTHER";
    amount: number;
    date: string;
    mode: string;
    note?: string;
    /** Settle this specific charge (one month's rent, say) first; the rest goes oldest-first. */
    chargeId?: string;
  }
) {
  const date = new Date(input.date);
  const entry = await prisma.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      amount: input.amount,
      date,
      mode: input.mode as never,
      note: input.note,
      receiptNo: await nextReceiptNo(date),
      recordedBy: actor,
    },
    include: { tenant: { select: { name: true } } },
  });

  // Deposits and refunds move the deposit balance; they don't settle charges.
  let unallocated = 0;
  if (input.type === "RENT" || input.type === "OTHER") {
    ({ unallocated } = await allocatePaymentToCharges(entry.id, input.tenantId, input.amount, input.chargeId));
  }

  await logActivity(
    actor,
    `${input.type === "RENT" ? "Rent" : input.type === "DEPOSIT" ? "Deposit" : input.type === "REFUND" ? "Refund" : "Payment"} recorded`,
    `${entry.tenant.name} · ₹${input.amount}`
  );

  revalidatePath("/ledger");
  revalidatePath(`/tenants/${input.tenantId}`);
  revalidatePath("/");
  return { entry, unallocated };
}

export async function deleteLedgerEntry(actor: string, id: string) {
  const entry = await prisma.ledgerEntry.delete({ where: { id } });
  // Allocations cascade away with the entry; rebuild so later payments move up
  // to cover the charges this one was settling.
  await reallocateTenant(entry.tenantId);

  await logActivity(actor, "Ledger entry deleted", `${entry.receiptNo ?? id} · ₹${Number(entry.amount)}`);
  revalidatePath("/ledger");
  revalidatePath(`/tenants/${entry.tenantId}`);
  revalidatePath("/");
}
