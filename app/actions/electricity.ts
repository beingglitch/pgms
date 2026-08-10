"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { billRoomElectricity } from "./charges";
import { round2 } from "@/lib/charges";

/** The last *closed* reading, to seed a new reading's starting value. An open one has no end number to seed from. */
export async function getLastReading(opts: { roomId?: string; tenantId?: string } = {}) {
  const scope = opts.roomId
    ? { roomId: opts.roomId }
    : opts.tenantId
      ? { tenantId: opts.tenantId }
      : { isMainMeter: true };

  return prisma.electricityBill.findFirst({
    where: { ...scope, endDate: { not: null } },
    orderBy: { endDate: "desc" },
  });
}

/**
 * Open a room's meter reading: a starting number and a proof photo, with no
 * current number yet. Closed out later, typically from Ledger > Dues, right
 * before a reminder goes out, via closeElectricityReading.
 *
 * A no-op if the room already has an *open* reading, so this is safe to call
 * speculatively without checking first. Past closed readings don't block a
 * new one, once a room's meter has been reset (or every tenant it had has
 * moved out), starting fresh is exactly the point.
 */
export async function startElectricityReading(
  actor: string,
  input: { roomId: string; startReading: number; startDate: string; ratePerUnit: number; photoUrl?: string }
) {
  const existing = await prisma.electricityBill.findFirst({
    where: { roomId: input.roomId, endDate: null },
    select: { id: true },
  });
  if (existing) return null;

  const bill = await prisma.electricityBill.create({
    data: {
      roomId: input.roomId,
      startReading: input.startReading,
      startDate: new Date(input.startDate),
      ratePerUnit: input.ratePerUnit,
      photoUrl: input.photoUrl,
      recordedBy: actor,
    },
    include: { room: { select: { number: true } } },
  });

  await logActivity(actor, "Meter reading started", `Room ${bill.room?.number} · starting at ${input.startReading}`);
  revalidatePath("/rooms");
  return bill;
}

/** The room's in-progress reading, if it has one: what the Dues close-out flow needs to show. */
export async function getOpenReadingForRoom(roomId: string) {
  return prisma.electricityBill.findFirst({
    where: { roomId, endDate: null },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Discard a room's open reading, unbilled, so the next tenant to move in
 * starts a clean one. Only ever touches an *open* reading, anything already
 * closed and billed is history, not something a reset undoes.
 */
export async function resetElectricityReading(actor: string, roomId: string) {
  const open = await prisma.electricityBill.findFirst({
    where: { roomId, endDate: null },
    include: { room: { select: { number: true } } },
  });
  if (!open) return null;

  await prisma.electricityBill.delete({ where: { id: open.id } });
  await logActivity(actor, "Meter reading reset", `Room ${open.room?.number ?? roomId}`);
  revalidatePath("/rooms");
  return open;
}

/**
 * Automatic version of the same reset: called whenever a room's occupancy
 * might have just dropped to zero (checkout, deletion, reassignment). A
 * silent no-op the rest of the time, so callers don't need to check first.
 */
export async function resetElectricityIfRoomEmpty(actor: string, roomId: string) {
  const stillOccupied = await prisma.tenant.count({ where: { roomId, status: "ACTIVE" } });
  if (stillOccupied === 0) await resetElectricityReading(actor, roomId);
}

/**
 * Close a room's open reading with the current number: computes units and
 * amount from the rate locked in when it was opened, then splits it into a
 * charge per current occupant via billRoomElectricity, the same split every
 * other room reading in the app gets.
 */
export async function closeElectricityReading(actor: string, billId: string, endReading: number, endDate: string) {
  const bill = await prisma.electricityBill.findUnique({ where: { id: billId }, include: { room: { select: { number: true } } } });
  if (!bill || bill.endDate) return null;

  const units = round2(endReading - Number(bill.startReading));
  if (units < 0) return null;
  const amount = round2(units * Number(bill.ratePerUnit));

  await prisma.electricityBill.update({
    where: { id: billId },
    data: { endReading, endDate: new Date(endDate), units, amount },
  });

  const result = await billRoomElectricity(actor, billId);

  await logActivity(
    actor,
    "Electricity reading closed",
    `Room ${bill.room?.number} · ${units} units · ₹${amount}`
  );
  revalidatePath("/rooms");
  revalidatePath("/ledger");
  revalidatePath("/expenses");
  revalidatePath("/");

  return { units, amount, chargesCreated: result.created };
}

/**
 * Deleting a reading takes its charges and its main-meter expense with it,
 * since both cascade from the foreign key, so nothing is left stranded.
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
