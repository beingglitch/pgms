"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import type { SplitMode } from "@/lib/generated/prisma/enums";

export async function getPgInfo() {
  const info = await prisma.pgInfo.findUnique({ where: { id: "singleton" } });
  if (info) return info;
  return prisma.pgInfo.create({ data: { id: "singleton" } });
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
    rentDueDay: number;
    dueSoonDays: number;
    defaultSplitMode: SplitMode;
  }
) {
  await prisma.pgInfo.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  await logActivity(actor, "Property details updated", Object.keys(data).join(", "));
  revalidatePath("/settings");
  revalidatePath("/rooms");
  revalidatePath("/ledger");
  revalidatePath("/");
}

export async function updateOwnerName(name: string) {
  const trimmed = name.trim() || "Owner";
  await prisma.pgInfo.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ownerName: trimmed },
    update: { ownerName: trimmed },
  });
  revalidatePath("/settings");
  revalidatePath("/");
  return trimmed;
}
