"use server";

import { prisma } from "@/lib/prisma";

export async function logActivity(actor: string, action: string, detail?: string) {
  await prisma.activityLog.create({
    data: { actor: actor || "Unknown", action, detail },
  });
}

export async function listActivity(limit = 100) {
  return prisma.activityLog.findMany({ orderBy: { ts: "desc" }, take: limit });
}
