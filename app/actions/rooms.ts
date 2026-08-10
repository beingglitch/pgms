"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { rentShare } from "@/lib/charges";
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
  const floors = await prisma.floor.findMany({
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
        perBed: rentShare(room),
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
    totals: {
      rooms: rooms.length,
      beds: rooms.reduce((s, r) => s + r.capacity, 0),
      occupied: rooms.reduce((s, r) => s + r.occupied, 0),
    },
  };
}

/**
 * Rooms for the onboarding picker: enough to show remaining beds, compute
 * what this room charges per bed, and know whether it's currently empty with
 * no meter reading in progress (so onboarding only asks for a starting
 * reading when there's genuinely nobody there to have started one already).
 */
export async function listRoomOptions() {
  const rooms = await prisma.room.findMany({
    orderBy: [{ floor: { order: "asc" } }, { number: "asc" }],
    include: {
      floor: { select: { name: true } },
      tenants: { where: { status: "ACTIVE" }, select: { id: true, bedNumber: true, joinDate: true, rentCycleAnchor: true } },
      meterReadings: { where: { endDate: null }, select: { id: true }, take: 1 },
    },
  });

  return rooms.map((room) => {
    const occupied = room.tenants.length;
    return {
      id: room.id,
      label: `${room.floor.name} · Room ${room.number}`,
      number: room.number,
      capacity: room.capacity,
      rentAmount: Number(room.rentAmount),
      occupied,
      perBed: rentShare(room),
      takenBeds: room.tenants.map((t) => t.bedNumber).filter(Boolean) as string[],
      hasOpenReading: room.meterReadings.length > 0,
      // Whoever's already there, so a new roommate's first charge can be
      // pro-rated up to their existing due-day instead of starting its own.
      existingOccupant: room.tenants[0]
        ? { joinDate: room.tenants[0].joinDate, rentCycleAnchor: room.tenants[0].rentCycleAnchor }
        : null,
    };
  });
}

export async function createFloor(actor: string, input: { name: string; order: number }) {
  const floor = await prisma.floor.create({
    data: { name: input.name.trim(), order: input.order },
  });
  await logActivity(actor, "Floor added", floor.name);
  revalidateRoomViews();
  return floor;
}

export async function updateFloor(actor: string, id: string, input: { name: string; order: number }) {
  const floor = await prisma.floor.update({
    where: { id },
    data: { name: input.name.trim(), order: input.order },
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
  input: { floorId: string; number: string; capacity: number; rentAmount: number; note?: string }
) {
  const room = await prisma.room.create({
    data: {
      floorId: input.floorId,
      number: input.number.trim(),
      capacity: Math.max(1, input.capacity),
      rentAmount: input.rentAmount,
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
  input: { number: string; capacity: number; rentAmount: number; note?: string }
) {
  const room = await prisma.room.update({
    where: { id },
    data: {
      number: input.number.trim(),
      capacity: Math.max(1, input.capacity),
      rentAmount: input.rentAmount,
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

  const previous = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { roomId: true } });

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

  if (previous?.roomId && previous.roomId !== roomId) await resetElectricityIfRoomEmpty(actor, previous.roomId);

  revalidateRoomViews();
  revalidatePath(`/tenants/${tenantId}`);
}
