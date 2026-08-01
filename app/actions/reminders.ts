"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";

export async function listReminders() {
  return prisma.reminder.findMany({
    orderBy: { dueDate: "asc" },
    include: { tenant: { select: { name: true, photoUrl: true, phone: true, email: true } } },
  });
}

export async function addReminder(
  actor: string,
  input: {
    tenantId: string;
    type: "RENT" | "ELECTRICITY" | "OTHER";
    title: string;
    dueDate: string;
    amount?: number;
    note?: string;
  }
) {
  const reminder = await prisma.reminder.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      dueDate: new Date(input.dueDate),
      amount: input.amount,
      note: input.note,
      createdBy: actor,
    },
    include: { tenant: { select: { name: true } } },
  });
  await logActivity(actor, "Reminder created", `${reminder.tenant?.name ?? "General"} · due ${input.dueDate}`);
  revalidatePath("/reminders");
  revalidatePath(`/tenants/${input.tenantId}`);
  return reminder;
}

export async function markReminder(actor: string, id: string, status: "PENDING" | "DONE") {
  await prisma.reminder.update({ where: { id }, data: { status } });
  await logActivity(actor, `Reminder marked ${status.toLowerCase()}`, id);
  revalidatePath("/reminders");
}

export async function deleteReminder(id: string) {
  await prisma.reminder.delete({ where: { id } });
  revalidatePath("/reminders");
}
