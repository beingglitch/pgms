"use server";

// NOTE: this app never sends a message itself. Everything here prepares text
// for the owner to send from their own WhatsApp or mail client, and records
// that they did. Scheduled or automatic sending would need a WhatsApp Business
// API or email provider; wa.me and mailto: links require a human to press send.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireAccountId } from "./auth";

const SENT_ACTION = "Dues reminder sent";

/**
 * Record that the owner handed a reminder to WhatsApp or their mail client.
 *
 * That's the furthest this app can see: the message left for the tenant's
 * app, which is not the same as it being read. Wording everywhere says
 * "reminded", never "delivered".
 */
export async function recordReminderSent(
  actor: string,
  input: { tenantId: string; tenantName: string; channel: "whatsapp" | "email"; amount: number }
) {
  const accountId = await requireAccountId();
  await logActivity(
    accountId,
    actor,
    SENT_ACTION,
    `${input.tenantName} · ₹${input.amount} · ${input.channel === "whatsapp" ? "WhatsApp" : "email"} · ${input.tenantId}`
  );
  revalidatePath("/reminders");
  revalidatePath("/");
}

/** When each tenant was last chased, newest first. */
export async function getReminderHistory(limit = 40) {
  const accountId = await requireAccountId();
  const logs = await prisma.activityLog.findMany({
    where: { accountId, action: SENT_ACTION },
    orderBy: { ts: "desc" },
    take: limit,
  });

  const lastSentByTenant = new Map<string, Date>();
  for (const log of logs) {
    const tenantId = log.detail?.split(" · ").at(-1);
    if (tenantId && !lastSentByTenant.has(tenantId)) lastSentByTenant.set(tenantId, log.ts);
  }

  return { logs, lastSentByTenant: Object.fromEntries(lastSentByTenant) };
}
