"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";

export async function getLastReading(tenantId?: string) {
  return prisma.electricityBill.findFirst({
    where: tenantId ? { tenantId } : { isMainMeter: true },
    orderBy: { endDate: "desc" },
  });
}

export async function listMainMeterReadings() {
  return prisma.electricityBill.findMany({
    where: { isMainMeter: true },
    orderBy: { endDate: "desc" },
  });
}

export async function addElectricityBill(
  actor: string,
  input: {
    tenantId?: string;
    isMainMeter?: boolean;
    startReading: number;
    endReading: number;
    startDate: string;
    endDate: string;
    ratePerUnit: number;
    photoUrl?: string;
  }
) {
  const units = input.endReading - input.startReading;
  const amount = units * input.ratePerUnit;

  const bill = await prisma.electricityBill.create({
    data: {
      tenantId: input.isMainMeter ? undefined : input.tenantId,
      isMainMeter: !!input.isMainMeter,
      startReading: input.startReading,
      endReading: input.endReading,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      units,
      ratePerUnit: input.ratePerUnit,
      amount,
      photoUrl: input.photoUrl,
      recordedBy: actor,
    },
    include: { tenant: { select: { name: true } } },
  });

  if (input.isMainMeter) {
    await prisma.expense.create({
      data: {
        title: "Main meter electricity",
        category: "Electricity (main meter)",
        amount,
        frequency: "ONE_TIME",
        date: new Date(input.endDate),
        note: `${units} units · ₹${input.ratePerUnit}/unit · ${new Date(input.startDate).toLocaleDateString("en-IN")} – ${new Date(input.endDate).toLocaleDateString("en-IN")}`,
        recordedBy: actor,
      },
    });
    revalidatePath("/expenses");
  }

  await logActivity(
    actor,
    "Electricity reading recorded",
    `${input.isMainMeter ? "Main meter" : bill.tenant?.name} · ${units} units · ₹${amount}`
  );
  if (input.tenantId) revalidatePath(`/tenants/${input.tenantId}`);
  revalidatePath("/expenses");
  return bill;
}

export async function deleteElectricityBill(actor: string, id: string, tenantId?: string) {
  await prisma.electricityBill.delete({ where: { id } });
  await logActivity(actor, "Electricity reading deleted", id);
  if (tenantId) revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/expenses");
}
