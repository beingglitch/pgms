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

/**
 * A standalone reminder the owner sets themselves - "renew Ramesh's
 * agreement", "collect signature", anything that isn't a dues charge and so
 * has no other place in the app to live. A tenant is optional: a property-
 * wide errand needs one too.
 */
export async function createReminder(
  actor: string,
  input: { tenantId?: string; type: "RENT" | "ELECTRICITY" | "OTHER"; title: string; dueDate: string; amount?: number; note?: string }
) {
  const accountId = await requireAccountId();
  if (input.tenantId) await prisma.tenant.findFirstOrThrow({ where: { id: input.tenantId, accountId } });

  const reminder = await prisma.reminder.create({
    data: {
      accountId,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title.trim(),
      dueDate: new Date(input.dueDate),
      amount: input.amount,
      note: input.note,
      createdBy: actor,
    },
  });
  await logActivity(accountId, actor, "Reminder created", reminder.title);
  revalidatePath("/reminders");
  if (input.tenantId) revalidatePath(`/tenants/${input.tenantId}`);
  return reminder;
}

/** Custom reminders still open, newest due first - and each tenant's own too, for their profile page. */
export async function listPendingReminders() {
  const accountId = await requireAccountId();
  return prisma.reminder.findMany({
    where: { accountId, status: "PENDING" },
    orderBy: { dueDate: "asc" },
    include: { tenant: { select: { id: true, name: true, photoUrl: true } } },
  });
}

export async function completeReminder(actor: string, id: string) {
  const accountId = await requireAccountId();
  const reminder = await prisma.reminder.findFirstOrThrow({ where: { id, accountId } });
  await prisma.reminder.update({ where: { id }, data: { status: "DONE" } });
  await logActivity(accountId, actor, "Reminder completed", reminder.title);
  revalidatePath("/reminders");
  if (reminder.tenantId) revalidatePath(`/tenants/${reminder.tenantId}`);
}

export async function deleteReminder(actor: string, id: string) {
  const accountId = await requireAccountId();
  const reminder = await prisma.reminder.findFirstOrThrow({ where: { id, accountId } });
  await prisma.reminder.delete({ where: { id } });
  await logActivity(accountId, actor, "Reminder deleted", reminder.title);
  revalidatePath("/reminders");
  if (reminder.tenantId) revalidatePath(`/tenants/${reminder.tenantId}`);
}
