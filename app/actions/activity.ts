"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountId } from "./auth";

export async function logActivity(accountId: string, actor: string, action: string, detail?: string) {
  await prisma.activityLog.create({
    data: { accountId, actor: actor || "Unknown", action, detail },
  });
}

export async function listActivity(limit = 100) {
  const accountId = await requireAccountId();
  return prisma.activityLog.findMany({ where: { accountId }, orderBy: { ts: "desc" }, take: limit });
}
