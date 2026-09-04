"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireAccountId } from "./auth";

/// The signed-in account's own settings row - always exists once signed in,
/// created at signup, so no more auto-create-on-missing-row here.
export async function getPgInfo() {
  const accountId = await requireAccountId();
  return prisma.account.findUniqueOrThrow({ where: { id: accountId } });
}

export async function updatePgInfo(
  actor: string,
  data: {
    name: string;
    shortName: string;
    logoUrl: string;
    address: string;
    contact: string;
    totalBeds: number;
    paymentLink: string;
    electricityRatePerUnit: number;
    dueSoonDays: number;
    dueLeadDays: number;
    fiscalYearStartMonth: number;
  }
) {
  const accountId = await requireAccountId();
  await prisma.account.update({ where: { id: accountId }, data });
  await logActivity(accountId, actor, "Property details updated", Object.keys(data).join(", "));
  revalidatePath("/settings");
  revalidatePath("/rooms");
  revalidatePath("/ledger");
  revalidatePath("/");
}

/** Just the default electricity rate, for editing it inline from wherever a reading gets billed. */
export async function updateDefaultElectricityRate(actor: string, rate: number) {
  const accountId = await requireAccountId();
  await prisma.account.update({ where: { id: accountId }, data: { electricityRatePerUnit: rate } });
  await logActivity(accountId, actor, "Electricity rate updated", `New default ₹${rate}/unit`);
  revalidatePath("/settings");
  revalidatePath("/rooms");
  revalidatePath("/");
}

export async function updateOwnerName(name: string) {
  const accountId = await requireAccountId();
  const trimmed = name.trim() || "Owner";
  await prisma.account.update({ where: { id: accountId }, data: { ownerName: trimmed } });
  revalidatePath("/settings");
  revalidatePath("/");
  return trimmed;
}
