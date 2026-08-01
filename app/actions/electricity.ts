"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";

export async function addElectricityBill(
  actor: string,
  input: { tenantId: string; month: string; units?: number; amount: number; billPhotoUrl?: string; date: string }
) {
  const bill = await prisma.electricityBill.create({
    data: {
      tenantId: input.tenantId,
      month: input.month,
      units: input.units,
      amount: input.amount,
      billPhotoUrl: input.billPhotoUrl,
      date: new Date(input.date),
      recordedBy: actor,
    },
    include: { tenant: { select: { name: true } } },
  });
  await logActivity(actor, "Electricity bill recorded", `${bill.tenant.name} · ${input.month} · ₹${input.amount}`);
  revalidatePath(`/tenants/${input.tenantId}`);
  return bill;
}

export async function deleteElectricityBill(actor: string, id: string, tenantId: string) {
  await prisma.electricityBill.delete({ where: { id } });
  await logActivity(actor, "Electricity bill deleted", id);
  revalidatePath(`/tenants/${tenantId}`);
}
