"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireAccountId } from "./auth";
import { effectiveRent, FULL_ROOM_BED, rentShare } from "@/lib/charges";
import { resetElectricityIfRoomEmpty } from "./electricity";

function revalidateRoomViews() {
  revalidatePath("/rooms");
  revalidatePath("/tenants");
  revalidatePath("/");
}

/**
 * The whole building: floors, their rooms, and who is in each bed.
 *
 * Beds are positional: a room of capacity 3 has beds 1, 2 and 3, so an
 * unoccupied bed is a gap in the list rather than a record of its own.
 */
export async function getBuilding() {
  const accountId = await requireAccountId();
  const floors = await prisma.floor.findMany({
    where: { accountId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      rooms: {
        orderBy: { number: "asc" },
        include: {
          tenants: {
            where: { status: "ACTIVE" },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              photoUrl: true,
              bedNumber: true,
              rentOverride: true,
              rentAmount: true,
              joinDate: true,
              rentCycleAnchor: true,
            },
          },
          // A handful of recent readings, enough to find both the latest
          // closed one (seeds the next reading's start value) and any
          // currently open one (started but not yet closed out).
          meterReadings: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
    },
  });

  const shaped = floors.map((floor) => ({
    ...floor,
    rooms: floor.rooms.map((room) => {
      // A tenant who has taken the whole room fills every bed slot, so the
      // room reads as fully occupied by them rather than offering the rest
      // of its beds to anyone else.
      const wholeRoomTenant = room.tenants.find((t) => t.bedNumber === FULL_ROOM_BED);

      const beds = Array.from({ length: room.capacity }, (_, i) => {
        const bedLabel = String(i + 1);
        return {
          bedNumber: bedLabel,
          tenant: wholeRoomTenant ?? room.tenants.find((t) => t.bedNumber === bedLabel) ?? null,
        };
      });

      // Anyone whose bed label doesn't line up with a numbered bed still needs
      // somewhere to show, so drop them into the first free slot.
      if (!wholeRoomTenant) {
        for (const tenant of room.tenants) {
          if (beds.some((b) => b.tenant?.id === tenant.id)) continue;
          const free = beds.find((b) => !b.tenant);
          if (free) free.tenant = tenant;
        }
      }

      return {
        ...room,
        perBed: rentShare(room),
        beds,
        occupied: wholeRoomTenant ? room.capacity : room.tenants.length,
        // What's actually being collected from this room right now (each
        // occupant's own agreed rent), separate from `rentAmount`, the
        // room's asking rent for an empty bed.
        billedTotal: room.tenants.reduce((s, t) => s + effectiveRent(t), 0),
        lastClosedReading: room.meterReadings.find((r) => r.endDate !== null) ?? null,
        openReading: room.meterReadings.find((r) => r.endDate === null) ?? null,
      };
    }),
  }));

  const rooms = shaped.flatMap((f) => f.rooms);
  return {
    floors: shaped,
    totals: {
      rooms: rooms.length,
      beds: rooms.reduce((s, r) => s + r.capacity, 0),
      occupied: rooms.reduce((s, r) => s + r.occupied, 0),
    },
  };
}

/**
 * Rooms for the room/bed picker: enough to show remaining beds, compute
 * what this room charges per bed, and know whether it's currently empty with
 * no meter reading in progress (so onboarding only asks for a starting
 * reading when there's genuinely nobody there to have started one already).
 *
 * `excludeTenantId` leaves one active tenant out of every room's occupancy
 * count - pass the tenant being edited so their own current bed shows up as
 * available (to keep or hand to someone else) instead of looking taken by
 * themselves, and so a room they're the sole occupant of correctly offers
 * "whole room" rather than reporting itself as occupied.
 */
export async function listRoomOptions(excludeTenantId?: string) {
  const accountId = await requireAccountId();
  const rooms = await prisma.room.findMany({
    where: { accountId },
    orderBy: [{ floor: { order: "asc" } }, { number: "asc" }],
    include: {
      floor: { select: { name: true, order: true } },
      tenants: {
        where: { status: "ACTIVE", id: excludeTenantId ? { not: excludeTenantId } : undefined },
        select: { id: true, bedNumber: true },
      },
      meterReadings: { where: { endDate: null }, select: { id: true }, take: 1 },
    },
  });

  return rooms.map((room) => {
    const wholeRoomTaken = room.tenants.some((t) => t.bedNumber === FULL_ROOM_BED);
    const takenBeds = wholeRoomTaken
      ? Array.from({ length: room.capacity }, (_, i) => String(i + 1))
      : (room.tenants.map((t) => t.bedNumber).filter(Boolean) as string[]);
    return {
      id: room.id,
      label: `${room.floor.name} · Room ${room.number}`,
      floorName: room.floor.name,
      floorOrder: room.floor.order,
      number: room.number,
      capacity: room.capacity,
      rentAmount: Number(room.rentAmount),
      occupied: wholeRoomTaken ? room.capacity : room.tenants.length,
      perBed: rentShare(room),
      takenBeds,
      // Which beds a new tenant could actually pick: any free numbered bed,
      // plus "the whole room" only when nobody at all is in it yet.
      freeBeds: Array.from({ length: room.capacity }, (_, i) => String(i + 1)).filter((b) => !takenBeds.includes(b)),
      canTakeWholeRoom: room.tenants.length === 0,
      hasOpenReading: room.meterReadings.length > 0,
    };
  });
}

export async function createFloor(actor: string, input: { name: string; order: number }) {
  const accountId = await requireAccountId();
  const floor = await prisma.floor.create({
    data: { accountId, name: input.name.trim(), order: input.order },
  });
  await logActivity(accountId, actor, "Floor added", floor.name);
  revalidateRoomViews();
  return floor;
}

export async function updateFloor(actor: string, id: string, input: { name: string; order: number }) {
  const accountId = await requireAccountId();
  await prisma.floor.findFirstOrThrow({ where: { id, accountId } });
  const floor = await prisma.floor.update({
    where: { id },
    data: { name: input.name.trim(), order: input.order },
  });
  await logActivity(accountId, actor, "Floor updated", floor.name);
  revalidateRoomViews();
}

export async function deleteFloor(actor: string, id: string) {
  const accountId = await requireAccountId();
  await prisma.floor.findFirstOrThrow({ where: { id, accountId } });
  const floor = await prisma.floor.delete({ where: { id } });
  await logActivity(accountId, actor, "Floor deleted", floor.name);
  revalidateRoomViews();
}

export async function createRoom(
  actor: string,
  input: { floorId: string; number: string; capacity: number; rentAmount: number; note?: string }
) {
  const accountId = await requireAccountId();
  await prisma.floor.findFirstOrThrow({ where: { id: input.floorId, accountId } });

  const room = await prisma.room.create({
    data: {
      accountId,
      floorId: input.floorId,
      number: input.number.trim(),
      capacity: Math.max(1, input.capacity),
      rentAmount: input.rentAmount,
      note: input.note,
    },
    include: { floor: { select: { name: true } } },
  });
  await logActivity(accountId, actor, "Room added", `${room.floor.name} · Room ${room.number} · ${room.capacity} bed(s)`);
  revalidateRoomViews();
}

export async function updateRoom(
  actor: string,
  id: string,
  input: { number: string; capacity: number; rentAmount: number; note?: string }
) {
  const accountId = await requireAccountId();
  const current = await prisma.room.findFirst({
    where: { id, accountId },
    include: { tenants: { where: { status: "ACTIVE" }, select: { id: true } } },
  });
  if (!current) throw new Error("Room not found.");
  const capacity = Math.max(1, input.capacity);
  if (capacity < current.tenants.length) {
    throw new Error(
      `${current.tenants.length} tenant(s) are currently in this room - capacity can't go below that.`
    );
  }

  const room = await prisma.room.update({
    where: { id },
    data: {
      number: input.number.trim(),
      capacity,
      rentAmount: input.rentAmount,
      note: input.note,
    },
  });

  // roomNumber on the tenant is a display mirror of the room's real number,
  // not a second source of truth - a rename here shouldn't leave anyone
  // showing the old one anywhere that reads the tenant record directly.
  // Rent is deliberately NOT cascaded to existing tenants here: what they're
  // billed is whatever was agreed at onboarding (or edited since) on their
  // own record, not a live recompute from the room - changing the room's
  // asking rent shouldn't silently move an already-settled tenant's number.
  if (current.number !== room.number) {
    await prisma.tenant.updateMany({
      where: { roomId: id, status: "ACTIVE" },
      data: { roomNumber: room.number },
    });
  }

  await logActivity(accountId, actor, "Room updated", `Room ${room.number}`);
  revalidateRoomViews();
}

export async function deleteRoom(actor: string, id: string) {
  const accountId = await requireAccountId();
  await prisma.room.findFirstOrThrow({ where: { id, accountId } });

  const affected = await prisma.tenant.findMany({
    where: { roomId: id, status: "ACTIVE" },
    select: { id: true },
  });
  const room = await prisma.room.delete({ where: { id } });

  // The relation clears itself (onDelete: SetNull), but the free-text
  // mirror fields and any full-room rent pin don't - without this, a
  // deleted room's former tenants would still look like they live there.
  if (affected.length > 0) {
    await prisma.tenant.updateMany({
      where: { id: { in: affected.map((t) => t.id) } },
      data: { roomNumber: null, bedNumber: null, rentOverride: null },
    });
  }

  await logActivity(accountId, actor, "Room deleted", `Room ${room.number}`);
  revalidateRoomViews();
}

/**
 * Move a tenant into a bed (or the whole room, via `FULL_ROOM_BED`), or out
 * of a room entirely when roomId is null.
 *
 * This is the only path that's allowed to change a tenant's room/bed - it's
 * what keeps the Room relation, the displayed rent, and the old room's
 * electricity state all moving together instead of drifting apart (a plain
 * text edit to "room number" used to change the label without touching any
 * of this, which is the bug this replaces).
 *
 * `rentAmount` is set to the new room's per-bed share (or full amount for
 * the whole room) as a starting suggestion - whoever's doing the move can
 * still edit it before saving, and that edited figure is what's billed
 * (effectiveRent reads the tenant's own record, never recomputes from the
 * room). Any earlier explicit pin (`rentOverride`) is cleared, since it
 * priced the room they're leaving, not this one.
 */
export async function assignTenantToRoom(
  actor: string,
  tenantId: string,
  roomId: string | null,
  bedNumber?: string | null
) {
  const accountId = await requireAccountId();
  await prisma.tenant.findFirstOrThrow({ where: { id: tenantId, accountId } });

  const room = roomId
    ? await prisma.room.findFirst({
        where: { id: roomId, accountId },
        include: {
          floor: { select: { name: true } },
          tenants: { where: { status: "ACTIVE", id: { not: tenantId } }, select: { id: true, bedNumber: true } },
        },
      })
    : null;
  if (roomId && !room) throw new Error("Room not found.");

  if (room) {
    const wholeRoomTaken = room.tenants.some((t) => t.bedNumber === FULL_ROOM_BED);
    if (bedNumber === FULL_ROOM_BED && room.tenants.length > 0) {
      throw new Error("Someone's already in this room, so it can't be given out whole.");
    }
    if (bedNumber !== FULL_ROOM_BED && wholeRoomTaken) {
      throw new Error("This room is taken whole by another tenant, move them out first.");
    }
  }

  const previous = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { roomId: true, bedNumber: true, rentOverride: true },
  });

  const newRentAmount = room ? (bedNumber === FULL_ROOM_BED ? Number(room.rentAmount) : rentShare(room)) : undefined;

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      roomId,
      bedNumber: bedNumber ?? null,
      roomNumber: room?.number ?? null,
      rentAmount: newRentAmount,
      rentOverride: previous?.rentOverride != null ? null : undefined,
    },
  });

  await logActivity(
    accountId,
    actor,
    roomId ? "Tenant assigned to bed" : "Tenant removed from room",
    room
      ? `${tenant.name} → ${room.floor.name} · Room ${room.number}${
          bedNumber === FULL_ROOM_BED ? " · whole room" : bedNumber ? ` · bed ${bedNumber}` : ""
        }`
      : tenant.name
  );

  if (previous?.roomId && previous.roomId !== roomId) await resetElectricityIfRoomEmpty(actor, previous.roomId);

  revalidateRoomViews();
  revalidatePath(`/tenants/${tenantId}`);
}
