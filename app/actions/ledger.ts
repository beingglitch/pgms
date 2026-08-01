"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";

export async function listLedger() {
  return prisma.ledgerEntry.findMany({
    orderBy: { date: "desc" },
    include: { tenant: { select: { name: true, photoUrl: true, roomNumber: true } } },
  });
}

export async function addLedgerEntry(
  actor: string,
  input: { tenantId: string; type: "RENT" | "DEPOSIT" | "OTHER"; amount: number; date: string; mode: string; note?: string }
) {
  const entry = await prisma.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      amount: input.amount,
      date: new Date(input.date),
      mode: input.mode as never,
      note: input.note,
      recordedBy: actor,
    },
    include: { tenant: { select: { name: true } } },
  });
  await logActivity(
    actor,
    `${input.type === "RENT" ? "Rent" : input.type === "DEPOSIT" ? "Deposit" : "Payment"} recorded`,
    `${entry.tenant.name} · ₹${input.amount}`
  );
  revalidatePath("/ledger");
  revalidatePath(`/tenants/${input.tenantId}`);
  revalidatePath("/");
  return entry;
}

export async function deleteLedgerEntry(actor: string, id: string) {
  await prisma.ledgerEntry.delete({ where: { id } });
  await logActivity(actor, "Ledger entry deleted", id);
  revalidatePath("/ledger");
  revalidatePath("/");
}
