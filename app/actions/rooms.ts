"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { getPgInfo } from "./settings";
import { rentShare, resolveSplitMode } from "@/lib/charges";
import type { SplitMode } from "@/lib/generated/prisma/enums";

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
  const [floors, pgInfo] = await Promise.all([
    prisma.floor.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        rooms: {
          orderBy: { number: "asc" },
          include: {
            tenants: {
              where: { status: "ACTIVE" },
              orderBy: { name: "asc" },
              select: { id: true, name: true, photoUrl: true, bedNumber: true, rentOverride: true, rentAmount: true },
            },
            // A handful of recent readings, enough to find both the latest
            // closed one (seeds the next reading's start value) and any
            // currently open one (started but not yet closed out).
            meterReadings: { orderBy: { createdAt: "desc" }, take: 5 },
          },
        },
      },
    }),
    getPgInfo(),
  ]);

  const shaped = floors.map((floor) => ({
    ...floor,
    rooms: floor.rooms.map((room) => {
      const mode = resolveSplitMode({ ...room, floor }, pgInfo.defaultSplitMode);
      const beds = Array.from({ length: room.capacity }, (_, i) => {
        const bedLabel = String(i + 1);
        return {
          bedNumber: bedLabel,
          tenant: room.tenants.find((t) => t.bedNumber === bedLabel) ?? null,
        };
      });

      // Anyone whose bed label doesn't line up with a numbered bed still needs
      // somewhere to show, so drop them into the first free slot.
      for (const tenant of room.tenants) {
        if (beds.some((b) => b.tenant?.id === tenant.id)) continue;
        const free = beds.find((b) => !b.tenant);
        if (free) free.tenant = tenant;
      }

      return {
        ...room,
        splitModeResolved: mode,
        perBed: rentShare(
          { ...room, floor },
          room.tenants.length || room.capacity,
          pgInfo.defaultSplitMode
        ),
        beds,
        occupied: room.tenants.length,
        lastClosedReading: room.meterReadings.find((r) => r.endDate !== null) ?? null,
        openReading: room.meterReadings.find((r) => r.endDate === null) ?? null,
      };
    }),
  }));

  const rooms = shaped.flatMap((f) => f.rooms);
  return {
    floors: shaped,
    defaultSplitMode: pgInfo.defaultSplitMode,
    totals: {
      rooms: rooms.length,
      beds: rooms.reduce((s, r) => s + r.capacity, 0),
      occupied: rooms.reduce((s, r) => s + r.occupied, 0),
    },
  };
}

/**
 * Rooms for the onboarding picker: enough to show remaining beds, compute
 * what this room would charge a new tenant, and know whether it already has
 * a meter reading on file (so onboarding only asks for a starting one when
 * there isn't one yet).
 */
export async function listRoomOptions() {
  const [rooms, pgInfo] = await Promise.all([
    prisma.room.findMany({
      orderBy: [{ floor: { order: "asc" } }, { number: "asc" }],
      include: {
        floor: { select: { name: true, splitMode: true } },
        tenants: { where: { status: "ACTIVE" }, select: { id: true, bedNumber: true } },
        meterReadings: { select: { id: true }, take: 1 },
      },
    }),
    getPgInfo(),
  ]);

  return rooms.map((room) => {
    const occupied = room.tenants.length;
    const splitModeResolved = resolveSplitMode({ ...room, floor: room.floor }, pgInfo.defaultSplitMode);
    return {
      id: room.id,
      label: `${room.floor.name} · Room ${room.number}`,
      number: room.number,
      capacity: room.capacity,
      rentAmount: Number(room.rentAmount),
      splitModeResolved,
      occupied,
      // The share a tenant joining right now would pay, factoring themselves
      // into the occupant count for BY_OCCUPANTS rooms. Meaningless (and 0)
      // under CUSTOM, where the room's rent doesn't apply to anyone in it.
      perBedIfJoining: splitModeResolved === "CUSTOM" ? 0 : rentShare({ ...room, floor: room.floor }, occupied + 1, pgInfo.defaultSplitMode),
      takenBeds: room.tenants.map((t) => t.bedNumber).filter(Boolean) as string[],
      hasMeterReading: room.meterReadings.length > 0,
    };
  });
}

export async function createFloor(actor: string, input: { name: string; order: number; splitMode?: SplitMode | null }) {
  const floor = await prisma.floor.create({
    data: { name: input.name.trim(), order: input.order, splitMode: input.splitMode ?? null },
  });
  await logActivity(actor, "Floor added", floor.name);
  revalidateRoomViews();
  return floor;
}

export async function updateFloor(
  actor: string,
  id: string,
  input: { name: string; order: number; splitMode?: SplitMode | null }
) {
  const floor = await prisma.floor.update({
    where: { id },
    data: { name: input.name.trim(), order: input.order, splitMode: input.splitMode ?? null },
  });
  await logActivity(actor, "Floor updated", floor.name);
  revalidateRoomViews();
}

export async function deleteFloor(actor: string, id: string) {
  const floor = await prisma.floor.delete({ where: { id } });
  await logActivity(actor, "Floor deleted", floor.name);
  revalidateRoomViews();
}

export async function createRoom(
  actor: string,
  input: { floorId: string; number: string; capacity: number; rentAmount: number; splitMode?: SplitMode | null; note?: string }
) {
  const room = await prisma.room.create({
    data: {
      floorId: input.floorId,
      number: input.number.trim(),
      capacity: Math.max(1, input.capacity),
      rentAmount: input.rentAmount,
      splitMode: input.splitMode ?? null,
      note: input.note,
    },
    include: { floor: { select: { name: true } } },
  });
  await logActivity(actor, "Room added", `${room.floor.name} · Room ${room.number} · ${room.capacity} bed(s)`);
  revalidateRoomViews();
  return room;
}

export async function updateRoom(
  actor: string,
  id: string,
  input: { number: string; capacity: number; rentAmount: number; splitMode?: SplitMode | null; note?: string }
) {
  const room = await prisma.room.update({
    where: { id },
    data: {
      number: input.number.trim(),
      capacity: Math.max(1, input.capacity),
      rentAmount: input.rentAmount,
      splitMode: input.splitMode ?? null,
      note: input.note,
    },
  });
  await logActivity(actor, "Room updated", `Room ${room.number}`);
  revalidateRoomViews();
}

export async function deleteRoom(actor: string, id: string) {
  const room = await prisma.room.delete({ where: { id } });
  await logActivity(actor, "Room deleted", `Room ${room.number}`);
  revalidateRoomViews();
}

/** Move a tenant into a bed, or out of a room entirely when roomId is null. */
export async function assignTenantToRoom(
  actor: string,
  tenantId: string,
  roomId: string | null,
  bedNumber?: string | null
) {
  const room = roomId
    ? await prisma.room.findUnique({ where: { id: roomId }, include: { floor: { select: { name: true } } } })
    : null;

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      roomId,
      bedNumber: bedNumber ?? null,
      roomNumber: room?.number ?? null,
    },
  });

  await logActivity(
    actor,
    roomId ? "Tenant assigned to bed" : "Tenant removed from room",
    room ? `${tenant.name} → ${room.floor.name} · Room ${room.number}${bedNumber ? ` · bed ${bedNumber}` : ""}` : tenant.name
  );

  revalidateRoomViews();
  revalidatePath(`/tenants/${tenantId}`);
}
