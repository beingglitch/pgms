"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { billRoomElectricity } from "./charges";
import { periodOf, round2 } from "@/lib/charges";

export async function getLastReading(opts: { roomId?: string; tenantId?: string } = {}) {
  const where = opts.roomId
    ? { roomId: opts.roomId }
    : opts.tenantId
      ? { tenantId: opts.tenantId }
      : { isMainMeter: true };

  return prisma.electricityBill.findFirst({ where, orderBy: { endDate: "desc" } });
}

export async function listMainMeterReadings() {
  return prisma.electricityBill.findMany({
    where: { isMainMeter: true },
    orderBy: { endDate: "desc" },
  });
}

/**
 * How much of the building's electricity the tenants have picked up.
 *
 * The main meter covers common areas as well as rooms, so the owner's real
 * cost is what's left after the sub-meter readings have been billed on.
 */
export async function getElectricityRecovery() {
  const [mainReadings, tenantCharges] = await Promise.all([
    prisma.electricityBill.findMany({ where: { isMainMeter: true }, orderBy: { endDate: "desc" } }),
    prisma.charge.findMany({ where: { type: "ELECTRICITY", waived: false }, select: { amount: true, period: true } }),
  ]);

  const recoveredByPeriod = new Map<string, number>();
  for (const charge of tenantCharges) {
    recoveredByPeriod.set(charge.period, round2((recoveredByPeriod.get(charge.period) ?? 0) + Number(charge.amount)));
  }

  const periods = mainReadings.map((reading) => {
    const period = periodOf(reading.endDate);
    const gross = Number(reading.amount);
    const recovered = recoveredByPeriod.get(period) ?? 0;
    return {
      id: reading.id,
      period,
      startDate: reading.startDate,
      endDate: reading.endDate,
      endReading: Number(reading.endReading),
      units: Number(reading.units),
      gross,
      recovered: round2(Math.min(recovered, gross)),
      net: round2(Math.max(gross - recovered, 0)),
    };
  });

  return {
    periods,
    totals: periods.reduce(
      (acc, p) => ({
        gross: round2(acc.gross + p.gross),
        recovered: round2(acc.recovered + p.recovered),
        net: round2(acc.net + p.net),
      }),
      { gross: 0, recovered: 0, net: 0 }
    ),
  };
}

export async function addElectricityBill(
  actor: string,
  input: {
    roomId?: string;
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
  const units = round2(input.endReading - input.startReading);
  const amount = round2(units * input.ratePerUnit);

  const bill = await prisma.electricityBill.create({
    data: {
      roomId: input.isMainMeter ? undefined : input.roomId,
      tenantId: input.isMainMeter || input.roomId ? undefined : input.tenantId,
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
    include: { room: { select: { number: true } }, tenant: { select: { name: true } } },
  });

  if (input.isMainMeter) {
    // The full bill is what leaves the owner's pocket, so that's what the
    // expense records. getElectricityRecovery() nets off what tenants repay.
    await prisma.expense.create({
      data: {
        title: "Main meter electricity",
        category: "Electricity (main meter)",
        amount,
        frequency: "ONE_TIME",
        date: new Date(input.endDate),
        note: `${units} units · ₹${input.ratePerUnit}/unit · ${new Date(input.startDate).toLocaleDateString("en-IN")} – ${new Date(input.endDate).toLocaleDateString("en-IN")}`,
        recordedBy: actor,
        sourceBillId: bill.id,
      },
    });
  } else {
    await billRoomElectricity(actor, bill.id);
  }

  await logActivity(
    actor,
    "Electricity reading recorded",
    `${input.isMainMeter ? "Main meter" : bill.room ? `Room ${bill.room.number}` : bill.tenant?.name} · ${units} units · ₹${amount}`
  );

  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/rooms");
  revalidatePath("/");
  if (input.tenantId) revalidatePath(`/tenants/${input.tenantId}`);
  return bill;
}

/**
 * Deleting a reading takes its charges and its main-meter expense with it —
 * both cascade from the foreign key, so nothing is left stranded.
 */
export async function deleteElectricityBill(actor: string, id: string, tenantId?: string) {
  await prisma.electricityBill.delete({ where: { id } });
  await logActivity(actor, "Electricity reading deleted", id);

  revalidatePath("/expenses");
  revalidatePath("/ledger");
  revalidatePath("/rooms");
  revalidatePath("/");
  if (tenantId) revalidatePath(`/tenants/${tenantId}`);
}
