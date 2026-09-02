"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BedDouble, DoorOpen, Layers, Pencil, Plus, RotateCcw, Trash2, Zap } from "lucide-react";
import { EmptyState, Panel, SectionHeading } from "@/components/khata";
import { BackButton } from "@/components/back-button";
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
import { resetElectricityReading, setMeterPhoto } from "@/app/actions/electricity";
import { useManager } from "@/lib/manager-context";
import { initials, fmtDate, dateISO, inr } from "@/lib/format";
import { FULL_ROOM_BED } from "@/lib/charges";
import type { Serialised } from "@/lib/serialize";
import { ZoomableAvatar, ZoomableImage } from "@/components/image-viewer";
import { toast } from "sonner";

type Building = Serialised<Awaited<ReturnType<typeof getBuilding>>>;
type Room = Building["floors"][number]["rooms"][number];
type Floor = Building["floors"][number];
type Person = { id: string; name: string; photoUrl: string | null };

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
  noticeTenantIds,
}: {
  building: Building;
  unassigned: Person[];
  noticeTenantIds: string[];
}) {
  const notice = new Set(noticeTenantIds);
  const router = useRouter();
  const { manager } = useManager();
  const [floorForm, setFloorForm] = useState<{ open: boolean; floor?: Floor }>({ open: false });
  const [roomForm, setRoomForm] = useState<{ open: boolean; floorId?: string; room?: Room }>({ open: false });
  const [assigning, setAssigning] = useState<{ room: Room; bedNumber: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  async function reset(room: Room) {
    setResetting(room.id);
    try {
      await resetElectricityReading(manager, room.id);
      toast.success(`Room ${room.number}'s meter reading reset`);
      router.refresh();
    } finally {
      setResetting(null);
    }
  }

  const { totals } = building;
  const allRooms = building.floors.flatMap((f) => f.rooms);
  const rentOnWall = allRooms.reduce((s, r) => s + Number(r.rentAmount), 0);
  const emptyBedsCost = allRooms.reduce((s, r) => s + (r.capacity - r.occupied) * r.perBed, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <BackButton fallbackHref="/" />
        <Button size="sm" variant="outline" onClick={() => setFloorForm({ open: true })}>
          <Layers className="h-4 w-4" /> Add floor
        </Button>
      </div>
      <h1 className="-mt-3 font-display text-[17px] font-semibold tracking-tight">Rooms &amp; beds</h1>

      <Panel className="grid grid-cols-3 gap-2 p-[13px]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Filled</p>
          <p className="mt-1 font-display text-[22px] font-semibold leading-none tracking-tight">
            {totals.occupied}/{totals.beds}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Rent on the wall</p>
          <p className="mt-1 font-display text-[22px] font-semibold leading-none tracking-tight tabular">{inr(rentOnWall)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Empty beds cost</p>
          <p className="mt-1 font-display text-[22px] font-semibold leading-none tracking-tight tabular text-ledger">
            {inr(emptyBedsCost)}
          </p>
        </div>
      </Panel>

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
                <ZoomableAvatar src={t.photoUrl} name={t.name} className="h-5 w-5" fallbackClassName="text-[8px]" />
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

      {building.floors.map((floor) => {
        const floorBeds = floor.rooms.reduce((s, r) => s + r.capacity, 0);
        const floorOccupied = floor.rooms.reduce((s, r) => s + r.occupied, 0);
        const floorRent = floor.rooms.reduce((s, r) => s + Number(r.rentAmount), 0);

        return (
          <section key={floor.id}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">{floor.name}</h2>
              <div className="flex items-center gap-2">
                {floor.rooms.length > 0 && (
                  <span className="text-[11px] font-bold text-primary">
                    {floorOccupied}/{floorBeds} filled · {inr(floorRent)}
                  </span>
                )}
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
              <div className="grid grid-cols-2 gap-[10px]">
                {floor.rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    resetting={resetting === room.id}
                    notice={notice}
                    onEdit={() => setRoomForm({ open: true, floorId: floor.id, room })}
                    onAssign={(bedNumber) => setAssigning({ room, bedNumber })}
                    onReset={() => reset(room)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {building.floors.some((f) => f.rooms.length > 0) && (
        <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-primary" /> Filled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-marigold" /> On notice
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-input" /> Vacant
          </span>
        </div>
      )}

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
    </div>
  );
}

function RoomCard({
  room,
  resetting,
  notice,
  onEdit,
  onAssign,
  onReset,
}: {
  room: Room;
  resetting: boolean;
  notice: Set<string>;
  onEdit: () => void;
  onAssign: (bedNumber: string) => void;
  onReset: () => void;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [showHistory, setShowHistory] = useState(false);

  const closedReadings = room.meterReadings.filter((r) => r.endDate);
  const vacantCount = room.capacity - room.occupied;
  const wholeRoomTenant =
    room.capacity > 1 && room.beds[0]?.tenant && room.beds.every((b) => b.tenant?.id === room.beds[0].tenant?.id)
      ? room.beds[0].tenant
      : null;
  const noteLine = wholeRoomTenant
    ? `${wholeRoomTenant.name} has the whole room`
    : vacantCount === 0
      ? `${room.occupied} of ${room.capacity} · full`
      : `${vacantCount} bed${vacantCount === 1 ? "" : "s"} free`;

  // Beds occupied by the same tenant (a whole-room tenant fills every one)
  // merge into a single bar instead of repeating their initials per bed.
  const bedGroups: { key: string; bedNumber: string; span: number; tenant: (typeof room.beds)[number]["tenant"] }[] = [];
  for (const bed of room.beds) {
    const last = bedGroups[bedGroups.length - 1];
    if (last && last.tenant?.id === bed.tenant?.id) last.span += 1;
    else bedGroups.push({ key: bed.bedNumber, bedNumber: bed.bedNumber, span: 1, tenant: bed.tenant });
  }

  return (
    <Panel className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[17px] font-semibold leading-none tracking-tight">Room {room.number}</p>
        <p className="tabular text-[11px] text-muted-foreground">{inr(room.rentAmount)}</p>
      </div>

      <div className="flex gap-1">
        {bedGroups.map((group) =>
          group.tenant ? (
            <Link
              key={group.key}
              href={`/tenants/${group.tenant.id}`}
              title={group.tenant.name}
              style={{ flexGrow: group.span }}
              className={`flex h-[22px] items-center justify-center rounded-[6px] text-[9px] font-bold transition-opacity hover:opacity-90 ${
                notice.has(group.tenant.id) ? "bg-marigold text-marigold-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              {initials(group.tenant.name)}
            </Link>
          ) : (
            <button
              key={group.key}
              onClick={() => onAssign(group.bedNumber)}
              style={{ flexGrow: group.span }}
              title={`Bed ${group.bedNumber} · vacant, tap to assign`}
              className="h-[22px] rounded-[6px] bg-input transition-opacity hover:opacity-70"
            />
          )
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{noteLine}</p>
        {room.occupied === 0 && room.capacity > 1 && (
          <button
            type="button"
            onClick={() => onAssign(FULL_ROOM_BED)}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Give whole room to one tenant
          </button>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/70 pt-2.5">
        <p className="text-xs text-muted-foreground">
          <BedDouble className="mr-1 inline h-3.5 w-3.5" />
          <strong className="tabular text-foreground">{`₹${room.perBed.toLocaleString("en-IN")}`}</strong> per bed
        </p>
        <Button size="sm" variant="ghost" onClick={onEdit} title="Edit room">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {room.openReading && (
        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          {room.openReading.photoUrl && (
            <ZoomableImage
              src={room.openReading.photoUrl}
              alt="Meter reading proof"
              downloadName={`room-${room.number}-meter-${dateISO(room.openReading.startDate)}.jpg`}
              thumbClassName="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
              onChange={async (url) => {
                await setMeterPhoto(manager, room.openReading!.id, url);
                router.refresh();
              }}
              onDelete={async () => {
                await setMeterPhoto(manager, room.openReading!.id, null);
                router.refresh();
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-xs font-semibold">
              <Zap className="h-3 w-3 shrink-0 text-muted-foreground" />
              Starting reading {Number(room.openReading.startReading).toLocaleString("en-IN")}
            </p>
            <p className="text-[11px] text-muted-foreground">Since {fmtDate(room.openReading.startDate)}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onReset} disabled={resetting} title="Reset meter reading">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {closedReadings.length > 0 && (
        <div className="border-t border-border/70 pt-2">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex w-full items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <span>
              <Zap className="mr-1 inline h-3 w-3" /> Past electricity cycles ({closedReadings.length})
            </span>
            <span>{showHistory ? "Hide" : "Show"}</span>
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {closedReadings.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {fmtDate(r.startDate)} → {fmtDate(r.endDate)} · {Number(r.startReading).toLocaleString("en-IN")}–
                    {Number(r.endReading).toLocaleString("en-IN")}
                  </span>
                  <span className="tabular font-semibold">
                    {r.units != null ? `${Number(r.units).toLocaleString("en-IN")} u · ` : ""}
                    {r.amount != null ? inr(Number(r.amount)) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
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
    const payload = { name, order };
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
  const [busy, setBusy] = useState(false);

  const perBed = capacity > 0 ? Math.round((rent / capacity) * 100) / 100 : rent;

  async function save() {
    if (!number.trim()) return toast.error("Give the room a number.");
    setBusy(true);
    const payload = { number, capacity, rentAmount: rent };
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
  const wholeRoom = state?.bedNumber === FULL_ROOM_BED;

  async function assign(tenantId: string) {
    if (!state) return;
    setBusy(true);
    try {
      await assignTenantToRoom(manager, tenantId, state.room.id, state.bedNumber);
      toast.success(wholeRoom ? `Given the whole of room ${state.room.number}` : `Moved into room ${state.room.number}`);
      onClose();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move them in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Room {state?.room.number} · {wholeRoom ? "whole room" : `bed ${state?.bedNumber}`}</DialogTitle>
        </DialogHeader>
        {wholeRoom && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Rent is set to the room&apos;s full amount, {state ? inr(state.room.rentAmount) : ""}, not the per-bed share.
          </p>
        )}
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
                <ZoomableAvatar src={t.photoUrl} name={t.name} className="h-8 w-8" fallbackClassName="text-[10px]" />
                <span className="text-sm font-semibold">{t.name}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
