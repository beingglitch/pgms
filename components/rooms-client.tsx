"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedDouble, DoorOpen, Layers, Pencil, Plus, Trash2, UserPlus, Zap } from "lucide-react";
import { Amount, EmptyState, PageTitle, Panel, SectionHeading, StatTile } from "@/components/khata";
import {
  assignTenantToRoom,
  createFloor,
  createRoom,
  deleteFloor,
  deleteRoom,
  getBuilding,
  updateFloor,
  updateRoom,
} from "@/app/actions/rooms";
import { MeterReadingDialog } from "@/components/meter-reading-dialog";
import { useManager } from "@/lib/manager-context";
import { initials } from "@/lib/format";
import { toast } from "sonner";
import type { SplitMode } from "@/lib/generated/prisma/enums";

type Building = Awaited<ReturnType<typeof getBuilding>>;
type Room = Building["floors"][number]["rooms"][number];
type Floor = Building["floors"][number];
type Person = { id: string; name: string; photoUrl: string | null };

const SPLIT_LABELS: Record<SplitMode, string> = {
  BY_CAPACITY: "Split by beds",
  BY_OCCUPANTS: "Split by people living there",
  CUSTOM: "Each tenant's own rent",
};

const CAPACITY_WORDS = ["", "Single", "Double", "Triple", "Four-sharing", "Five-sharing", "Six-sharing"];

function capacityWord(n: number) {
  return CAPACITY_WORDS[n] ?? `${n}-sharing`;
}

// Ground, First, Second: the order names on an Indian building, in the
// order floors are usually added. Renaming afterward is always available.
const ORDINAL_FLOOR_NAMES = [
  "Ground",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
];

function nextFloorName(existingCount: number) {
  return ORDINAL_FLOOR_NAMES[existingCount] ?? `Floor ${existingCount + 1}`;
}

export function RoomsClient({
  building,
  unassigned,
  electricityRate,
}: {
  building: Building;
  unassigned: Person[];
  electricityRate: number;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [floorForm, setFloorForm] = useState<{ open: boolean; floor?: Floor }>({ open: false });
  const [roomForm, setRoomForm] = useState<{ open: boolean; floorId?: string; room?: Room }>({ open: false });
  const [assigning, setAssigning] = useState<{ room: Room; bedNumber: string } | null>(null);
  const [metering, setMetering] = useState<Room | null>(null);

  const { totals } = building;
  const vacant = totals.beds - totals.occupied;

  return (
    <div className="space-y-5">
      <PageTitle
        action={
          <Button size="sm" variant="outline" onClick={() => setFloorForm({ open: true })}>
            <Layers className="h-4 w-4" /> Add floor
          </Button>
        }
      >
        Rooms &amp; beds
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Rooms" value={totals.rooms} />
        <StatTile label="Beds filled" value={`${totals.occupied}/${totals.beds}`} tone="positive" />
        <StatTile label="Vacant" value={vacant} tone={vacant > 0 ? "owed" : "muted"} className="col-span-2 sm:col-span-1" />
      </div>

      {unassigned.length > 0 && (
        <Panel className="border-marigold/40 bg-marigold/5">
          <SectionHeading>Not in a room yet</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((t) => (
              <Link
                key={t.id}
                href={`/tenants/${t.id}`}
                className="flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold"
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={t.photoUrl ?? undefined} />
                  <AvatarFallback className="text-[8px]">{initials(t.name)}</AvatarFallback>
                </Avatar>
                {t.name}
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Put each of them in a bed so their rent splits correctly and their meter reading finds them.
          </p>
        </Panel>
      )}

      {building.floors.length === 0 && (
        <EmptyState
          icon={DoorOpen}
          title="Map out your building"
          action={
            <Button onClick={() => setFloorForm({ open: true })}>
              <Plus className="h-4 w-4" /> Add your first floor
            </Button>
          }
        >
          Add a floor, then the rooms on it and how many beds each has. Rent then splits per bed on its own.
        </EmptyState>
      )}

      {building.floors.map((floor) => (
        <section key={floor.id}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">{floor.name}</h2>
              <span className="text-xs text-muted-foreground">
                {floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"}
                {floor.splitMode ? ` · ${SPLIT_LABELS[floor.splitMode].toLowerCase()}` : ""}
              </span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setFloorForm({ open: true, floor })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRoomForm({ open: true, floorId: floor.id })}>
                <Plus className="h-3.5 w-3.5" /> Room
              </Button>
            </div>
          </div>

          {floor.rooms.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No rooms on this floor yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {floor.rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onEdit={() => setRoomForm({ open: true, floorId: floor.id, room })}
                  onAssign={(bedNumber) => setAssigning({ room, bedNumber })}
                  onMeter={() => setMetering(room)}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      <FloorDialog
        key={`floor-${floorForm.floor?.id ?? "new"}-${floorForm.open}`}
        state={floorForm}
        floorCount={building.floors.length}
        onClose={() => setFloorForm({ open: false })}
        manager={manager}
        onDone={() => router.refresh()}
      />
      <RoomDialog
        key={`room-${roomForm.room?.id ?? "new"}-${roomForm.open}`}
        state={roomForm}
        onClose={() => setRoomForm({ open: false })}
        manager={manager}
        onDone={() => router.refresh()}
      />
      <AssignDialog
        state={assigning}
        candidates={unassigned}
        onClose={() => setAssigning(null)}
        manager={manager}
        onDone={() => router.refresh()}
      />
      {metering && (
        <MeterReadingDialog
          key={metering.id}
          open={!!metering}
          onOpenChange={(o) => !o && setMetering(null)}
          roomId={metering.id}
          occupants={metering.tenants.map((t) => ({ id: t.id, name: t.name }))}
          defaultRate={electricityRate}
          lastReading={
            metering.meterReadings[0]
              ? {
                  endReading: Number(metering.meterReadings[0].endReading),
                  endDate: metering.meterReadings[0].endDate.toISOString(),
                }
              : null
          }
        />
      )}

      {building.floors.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Rent is split <strong>{SPLIT_LABELS[building.defaultSplitMode].toLowerCase()}</strong> unless a floor or room
          says otherwise. Change the property-wide default in Settings.
        </p>
      )}
    </div>
  );
}

function RoomCard({
  room,
  onEdit,
  onAssign,
  onMeter,
}: {
  room: Room;
  onEdit: () => void;
  onAssign: (bedNumber: string) => void;
  onMeter: () => void;
}) {
  const full = room.occupied >= room.capacity;

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-semibold leading-none tracking-tight">Room {room.number}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {capacityWord(room.capacity)} · {room.occupied}/{room.capacity} filled
          </p>
        </div>
        <div className="text-right">
          <Amount value={room.rentAmount} size="sm" />
          <p className="text-[11px] text-muted-foreground">room total</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {room.beds.map((bed) =>
          bed.tenant ? (
            <Link
              key={bed.bedNumber}
              href={`/tenants/${bed.tenant.id}`}
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 transition-colors hover:bg-muted"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={bed.tenant.photoUrl ?? undefined} />
                <AvatarFallback className="text-[9px]">{initials(bed.tenant.name)}</AvatarFallback>
              </Avatar>
              <span className="max-w-28 truncate text-xs font-semibold">{bed.tenant.name}</span>
            </Link>
          ) : (
            <button
              key={bed.bedNumber}
              onClick={() => onAssign(bed.bedNumber)}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <UserPlus className="h-3.5 w-3.5" /> Bed {bed.bedNumber}
            </button>
          )
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
        <p className="text-xs text-muted-foreground">
          <BedDouble className="mr-1 inline h-3.5 w-3.5" />
          {room.splitModeResolved === "CUSTOM" ? (
            "Each tenant's own rent"
          ) : (
            <>
              <strong className="tabular text-foreground">{`₹${room.perBed.toLocaleString("en-IN")}`}</strong> per bed
            </>
          )}
          {full ? "" : room.splitModeResolved === "BY_OCCUPANTS" ? " · rises if someone leaves" : ""}
        </p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onMeter} title="Log meter reading">
            <Zap className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} title="Edit room">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function SplitPicker({
  value,
  onChange,
  inheritLabel,
}: {
  value: SplitMode | "INHERIT";
  onChange: (v: SplitMode | "INHERIT") => void;
  inheritLabel: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SplitMode | "INHERIT")}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="INHERIT">{inheritLabel}</SelectItem>
        <SelectItem value="BY_CAPACITY">{SPLIT_LABELS.BY_CAPACITY}</SelectItem>
        <SelectItem value="BY_OCCUPANTS">{SPLIT_LABELS.BY_OCCUPANTS}</SelectItem>
        <SelectItem value="CUSTOM">{SPLIT_LABELS.CUSTOM}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function FloorDialog({
  state,
  floorCount,
  onClose,
  manager,
  onDone,
}: {
  state: { open: boolean; floor?: Floor };
  /** How many floors already exist, so the next ordinal name can be picked. */
  floorCount: number;
  onClose: () => void;
  manager: string;
  onDone: () => void;
}) {
  const floor = state.floor;
  const [name, setName] = useState(floor?.name ?? nextFloorName(floorCount));
  const [order, setOrder] = useState(floor?.order ?? floorCount);
  const [busy, setBusy] = useState(false);

  // Bulk room generation is only offered when creating a new floor. Editing an
  // existing floor just edits the floor; rooms are added on the floor card.
  const [startNumber, setStartNumber] = useState("");
  const [singleCount, setSingleCount] = useState(0);
  const [singleRent, setSingleRent] = useState(0);
  const [doubleCount, setDoubleCount] = useState(0);
  const [doubleRent, setDoubleRent] = useState(0);

  async function save() {
    if (!name.trim()) return toast.error("Give the floor a name.");
    const roomsToCreate = singleCount + doubleCount;
    if (!floor && roomsToCreate > 0 && !startNumber.trim()) {
      return toast.error("Give the first room a number so the rest can follow on from it.");
    }

    setBusy(true);
    // Floors no longer set a rent split of their own: only the property
    // default and each room's own override apply.
    const payload = { name, order, splitMode: floor?.splitMode ?? null };
    try {
      if (floor) {
        await updateFloor(manager, floor.id, payload);
        toast.success("Floor updated");
      } else {
        const created = await createFloor(manager, payload);

        if (roomsToCreate > 0) {
          // Numbers are plain integers when the starting value is one, so
          // "101" produces 102, 103…; anything else is treated as a prefix
          // and gets a running count appended (e.g. "A" -> A1, A2, A3).
          const asInt = /^\d+$/.test(startNumber.trim());
          const base = asInt ? parseInt(startNumber, 10) : 0;
          let i = 0;
          const nextNumber = () => {
            const value = asInt ? String(base + i) : `${startNumber.trim()}${i + 1}`;
            i += 1;
            return value;
          };

          const specs = [
            ...Array.from({ length: singleCount }, () => ({ capacity: 1, rentAmount: singleRent })),
            ...Array.from({ length: doubleCount }, () => ({ capacity: 2, rentAmount: doubleRent })),
          ];
          for (const spec of specs) {
            await createRoom(manager, { floorId: created.id, number: nextNumber(), ...spec });
          }
        }

        toast.success(roomsToCreate > 0 ? `Floor added with ${roomsToCreate} room(s)` : "Floor added");
      }
      onClose();
      onDone();
    } catch {
      toast.error("That floor or room number is already taken.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!floor) return;
    await deleteFloor(manager, floor.id);
    toast.success("Floor deleted");
    onClose();
    onDone();
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{floor ? "Edit floor" : "Add floor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ground, First, Second…" />
          </div>
          <div>
            <Label className="mb-1.5">Order</Label>
            <Input type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
            <p className="mt-1 text-xs text-muted-foreground">Lower numbers appear first.</p>
          </div>

          {!floor && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-semibold">Rooms on this floor</p>
                <p className="text-xs text-muted-foreground">
                  Set how many of each kind and they&apos;ll be created and numbered for you. Leave both at 0 to add
                  rooms one at a time later instead.
                </p>
              </div>

              <div>
                <Label className="mb-1.5">First room number</Label>
                <Input value={startNumber} onChange={(e) => setStartNumber(e.target.value)} placeholder="101" />
                <p className="mt-1 text-xs text-muted-foreground">The rest are numbered on from this.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">Single-sharing rooms</Label>
                  <Input
                    type="number"
                    min={0}
                    value={singleCount}
                    onChange={(e) => setSingleCount(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div>
                  <Label className="mb-1.5">Rent per room</Label>
                  <Input
                    type="number"
                    value={singleRent || ""}
                    onChange={(e) => setSingleRent(Number(e.target.value))}
                    disabled={singleCount === 0}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">Double-sharing rooms</Label>
                  <Input
                    type="number"
                    min={0}
                    value={doubleCount}
                    onChange={(e) => setDoubleCount(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div>
                  <Label className="mb-1.5">Rent per room</Label>
                  <Input
                    type="number"
                    value={doubleRent || ""}
                    onChange={(e) => setDoubleRent(Number(e.target.value))}
                    disabled={doubleCount === 0}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={busy} className="flex-1">
              {floor ? "Save floor" : "Add floor"}
            </Button>
            {floor && (
              <Button variant="destructive" onClick={remove} disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          {floor && (
            <p className="text-xs text-muted-foreground">
              Deleting a floor removes its rooms too. Tenants stay, but lose their bed.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoomDialog({
  state,
  onClose,
  manager,
  onDone,
}: {
  state: { open: boolean; floorId?: string; room?: Room };
  onClose: () => void;
  manager: string;
  onDone: () => void;
}) {
  const room = state.room;
  const [number, setNumber] = useState(room?.number ?? "");
  const [capacity, setCapacity] = useState(room?.capacity ?? 1);
  const [rent, setRent] = useState(Number(room?.rentAmount ?? 0));
  const [split, setSplit] = useState<SplitMode | "INHERIT">(room?.splitMode ?? "INHERIT");
  const [busy, setBusy] = useState(false);

  const perBed = capacity > 0 ? Math.round((rent / capacity) * 100) / 100 : rent;

  async function save() {
    if (!number.trim()) return toast.error("Give the room a number.");
    setBusy(true);
    const payload = { number, capacity, rentAmount: rent, splitMode: split === "INHERIT" ? null : split };
    try {
      if (room) await updateRoom(manager, room.id, payload);
      else if (state.floorId) await createRoom(manager, { floorId: state.floorId, ...payload });
      toast.success(room ? "Room updated" : "Room added");
      onClose();
      onDone();
    } catch {
      toast.error("That room number already exists on this floor.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!room) return;
    await deleteRoom(manager, room.id);
    toast.success("Room deleted");
    onClose();
    onDone();
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{room ? `Edit room ${room.number}` : "Add room"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5">Room number</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="101" />
            </div>
            <div>
              <Label className="mb-1.5">Beds</Label>
              <Input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5">Rent for the whole room</Label>
            <Input type="number" value={rent} onChange={(e) => setRent(Number(e.target.value))} />
            <p className="mt-1 text-xs text-muted-foreground">
              {capacityWord(capacity)} room ·{" "}
              <strong className="tabular text-foreground">₹{perBed.toLocaleString("en-IN")}</strong> per bed
            </p>
          </div>
          <div>
            <Label className="mb-1.5">Rent split for this room</Label>
            <SplitPicker value={split} onChange={setSplit} inheritLabel="Use the floor / property setting" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={busy} className="flex-1">
              {room ? "Save room" : "Add room"}
            </Button>
            {room && (
              <Button variant="destructive" onClick={remove} disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  state,
  candidates,
  onClose,
  manager,
  onDone,
}: {
  state: { room: Room; bedNumber: string } | null;
  candidates: Person[];
  onClose: () => void;
  manager: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function assign(tenantId: string) {
    if (!state) return;
    setBusy(true);
    await assignTenantToRoom(manager, tenantId, state.room.id, state.bedNumber);
    toast.success(`Moved into room ${state.room.number}`);
    setBusy(false);
    onClose();
    onDone();
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Room {state?.room.number} · bed {state?.bedNumber}
          </DialogTitle>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Everyone already has a bed. Add a tenant first, or move someone out of their current room.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="mb-2 text-sm text-muted-foreground">Who is moving in?</p>
            {candidates.map((t) => (
              <button
                key={t.id}
                disabled={busy}
                onClick={() => assign(t.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={t.photoUrl ?? undefined} />
                  <AvatarFallback className="text-[10px]">{initials(t.name)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold">{t.name}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
