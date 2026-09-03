"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoUpload } from "@/components/photo-upload";
import { useManager } from "@/lib/manager-context";
import { createTenant, updateTenant, updateAgreementFields, type TenantInput, type AgreementInput } from "@/app/actions/tenants";
import { assignTenantToRoom } from "@/app/actions/rooms";
import { todayISO, inr, fmtDate } from "@/lib/format";
import {
  addPeriods,
  dayRangeLabel,
  daysInPeriod,
  FULL_ROOM_BED,
  pendingRentPeriods,
  periodLabel,
  planAllocations,
  round2,
  type RentPeriodPlan,
} from "@/lib/charges";
import { waLink } from "@/lib/messaging";
import { Plus, X, Download, MessageCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { listRoomOptions } from "@/app/actions/rooms";

type ExistingTenant = Partial<TenantInput> & { id?: string };
type RoomOption = Awaited<ReturnType<typeof listRoomOptions>>[number];

type CurrentAgreement = {
  electricityRate: number;
  facilities: { name: string; amount: number }[];
  depositRefundable: boolean;
  laundryChargeable: boolean;
  laundryCharge: number;
  note: string;
  photoUrl: string;
};

export function TenantFormDialog({
  open,
  onOpenChange,
  initial,
  currentAgreement,
  roomOptions = [],
  electricityRatePerUnit = 8,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ExistingTenant | null;
  /** The tenant's existing agreement, when editing: seeds the electricity/extra-charges fields instead of blank defaults. */
  currentAgreement?: CurrentAgreement | null;
  /** Rooms with a bed free, for the onboarding-only room/bed picker. */
  roomOptions?: RoomOption[];
  /** The property's current electricity rate, from Settings, locked into the agreement at onboarding. */
  electricityRatePerUnit?: number;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const isNew = !initial?.id;

  function blankTenant(): TenantInput {
    return {
      name: initial?.name || "",
      phone: initial?.phone || "",
      email: initial?.email || "",
      fatherName: initial?.fatherName || "",
      motherName: initial?.motherName || "",
      roomNumber: initial?.roomNumber || "",
      bedNumber: initial?.bedNumber || "",
      rentAmount: initial?.rentAmount || 0,
      depositAmount: initial?.depositAmount || 0,
      depositMethod: initial?.depositMethod || "CASH",
      depositChequeNumber: initial?.depositChequeNumber || "",
      depositChequeBank: initial?.depositChequeBank || "",
      joinDate: initial?.joinDate || todayISO(),
      pan: initial?.pan || "",
      idProofType: initial?.idProofType || "College ID",
      idProofNumber: initial?.idProofNumber || "",
      aadhaarFrontUrl: initial?.aadhaarFrontUrl || "",
      aadhaarBackUrl: initial?.aadhaarBackUrl || "",
      photoUrl: initial?.photoUrl || "",
      carNumber: initial?.carNumber || "",
      carModel: initial?.carModel || "",
      address: initial?.address || "",
      emergencyContact: initial?.emergencyContact || "",
      emergencyPhone: initial?.emergencyPhone || "",
      notes: initial?.notes || "",
    };
  }

  function blankAgreement(rentAmount: number, depositAmount: number, roomNumber?: string): AgreementInput {
    return {
      roomNumber,
      rentAmount,
      depositAmount,
      depositRefundable: currentAgreement?.depositRefundable ?? true,
      electricityRate: currentAgreement?.electricityRate ?? electricityRatePerUnit,
      laundryChargeable: currentAgreement?.laundryChargeable ?? false,
      laundryCharge: currentAgreement?.laundryCharge ?? 0,
      facilities: currentAgreement?.facilities ?? [],
      photoUrl: currentAgreement?.photoUrl ?? "",
      note: currentAgreement?.note ?? "",
    };
  }

  const [f, setF] = useState<TenantInput>(blankTenant());
  const [agreement, setAgreement] = useState<AgreementInput>(blankAgreement(f.rentAmount, f.depositAmount, f.roomNumber));
  const [submitted, setSubmitted] = useState(false);

  const [saving, setSaving] = useState(false);

  // Floor -> room -> tappable bed chips, shared by onboarding and editing.
  // At onboarding this only ever shows free beds (plus "whole room" when
  // nobody's in it yet); when editing, `listRoomOptions(id)` leaves the
  // tenant's own current bed out of the occupancy count so it shows up as
  // pickable too, rather than looking taken by themselves.
  const [pickedRoomId, setPickedRoomId] = useState<string | null>(initial?.roomId ?? null);
  const [pickedBed, setPickedBed] = useState<string | null>(initial?.bedNumber ?? null);
  // Edit-mode-only: explicitly taking a room-linked tenant out of the
  // building, distinct from "haven't picked a bed yet".
  const [removedFromRoom, setRemovedFromRoom] = useState(false);
  const [meterStartReading, setMeterStartReading] = useState("");
  const [meterStartPhotoUrl, setMeterStartPhotoUrl] = useState("");
  const [advancePayment, setAdvancePayment] = useState("");
  // Period ("YYYY-MM") -> owner-edited amount, for whenever the calculated
  // rent (a pro-rated first month, say) isn't quite what was actually agreed.
  const [rentOverrides, setRentOverrides] = useState<Record<string, number>>({});
  const pickedRoom = roomOptions.find((r) => r.id === pickedRoomId) ?? null;

  // What rent will actually land on the books, overrides applied - shared by
  // the editable preview list and the advance-payment split below it.
  const billingPlan =
    isNew && f.rentAmount > 0 && f.joinDate && !isNaN(new Date(f.joinDate).getTime())
      ? pendingRentPeriods(f.rentAmount, f.joinDate, new Date(), PREVIEW_LEAD_DAYS, new Set()).map((p) => ({
          ...p,
          amount: rentOverrides[p.period] ?? p.amount,
        }))
      : [];

  const availableRooms = roomOptions.filter((r) => r.freeBeds.length > 0 || r.canTakeWholeRoom);
  const floors = Array.from(new Map(availableRooms.map((r) => [r.floorName, r.floorOrder])).entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  function pickBed(room: RoomOption, bed: string) {
    setPickedRoomId(room.id);
    setPickedBed(bed);
    setRemovedFromRoom(false);
    setF((s) => ({
      ...s,
      roomNumber: room.number,
      bedNumber: bed,
      rentAmount: bed === FULL_ROOM_BED ? room.rentAmount : room.perBed,
    }));
  }

  function clearRoomPick() {
    setPickedRoomId(null);
    setPickedBed(null);
    setRemovedFromRoom(false);
  }

  function set<K extends keyof TenantInput>(key: K, value: TenantInput[K]) {
    setF((s) => ({ ...s, [key]: value }));
  }

  /** Back to a blank onboarding form, so the next "Add tenant" doesn't reopen with the last one's details. */
  function resetForm() {
    const blank = blankTenant();
    setF(blank);
    setAgreement(blankAgreement(blank.rentAmount, blank.depositAmount, blank.roomNumber));
    setPickedRoomId(null);
    setPickedBed(null);
    setMeterStartReading("");
    setMeterStartPhotoUrl("");
    setAdvancePayment("");
    setRentOverrides({});
    setSubmitted(false);
  }

  function close() {
    if (isNew) resetForm();
    onOpenChange(false);
  }

  function addFacility() {
    setAgreement((a) => ({ ...a, facilities: [...a.facilities, { name: "", amount: 0 }] }));
  }
  function updateFacility(i: number, key: "name" | "amount", value: string | number) {
    setAgreement((a) => ({
      ...a,
      facilities: a.facilities.map((fac, idx) => (idx === i ? { ...fac, [key]: value } : fac)),
    }));
  }
  function removeFacility(i: number) {
    setAgreement((a) => ({ ...a, facilities: a.facilities.filter((_, idx) => idx !== i) }));
  }

  /** A plain-text preview of the terms, built from whatever's filled in so far. */
  function agreementPreview() {
    const facilitiesText = agreement.facilities
      .filter((fac) => fac.name.trim())
      .map((fac) => `${fac.name}: ${inr(fac.amount)}`)
      .join(", ");
    return [
      `Terms for ${f.name || "the tenant"}${pickedRoom ? ` · ${pickedRoom.label}` : f.roomNumber ? ` · Room ${f.roomNumber}` : ""}:`,
      `Monthly rent: ${inr(f.rentAmount)}`,
      `Security deposit: ${inr(f.depositAmount)}`,
      `Electricity: ${inr(agreement.electricityRate)} per unit`,
      facilitiesText ? `Other charges: ${facilitiesText}` : null,
      `Joining: ${f.joinDate}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function downloadAgreement() {
    const blob = new Blob([agreementPreview()], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${f.name || "tenant"}-agreement.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    if (!f.name.trim() || !f.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    if (isNew && !(f.rentAmount > 0)) {
      toast.error("Set a monthly rent — without it, no rent will ever get billed.");
      return;
    }
    if (isNew && !(f.depositAmount > 0)) {
      toast.error("Set a deposit amount before onboarding.");
      return;
    }
    if (pickedRoomId && !pickedBed) {
      toast.error("Pick which bed (or the whole room)");
      return;
    }
    // A picked room always needs a meter number and a photo: it either
    // starts the room's first reading or closes the current one for the
    // people already there, and both need real proof.
    if (isNew && pickedRoomId) {
      const reading = Number(meterStartReading);
      if (meterStartReading.trim() === "" || !Number.isFinite(reading) || reading < 0) {
        toast.error("Enter the current meter reading for this room");
        return;
      }
      if (!meterStartPhotoUrl) {
        toast.error("Add a photo of the meter as proof of the reading");
        return;
      }
    }
    setSaving(true);
    try {
      if (isNew) {
        await createTenant(
          manager,
          {
            ...f,
            roomId: pickedRoomId ?? undefined,
            meterStartReading: meterStartReading !== "" ? Number(meterStartReading) : undefined,
            meterStartPhotoUrl: meterStartPhotoUrl || undefined,
            advancePayment: advancePayment !== "" ? Number(advancePayment) : undefined,
            rentOverrides: Object.keys(rentOverrides).length > 0 ? rentOverrides : undefined,
          },
          { ...agreement, roomNumber: f.roomNumber, rentAmount: f.rentAmount, depositAmount: f.depositAmount }
        );
        toast.success(
          pickedRoom
            ? `Tenant onboarded into ${pickedRoom.label}${pickedBed === FULL_ROOM_BED ? " (whole room)" : ` · bed ${pickedBed}`}`
            : "Tenant onboarded"
        );
        router.refresh();
        // Stay open so the download/share buttons below have something to
        // hand over; the form itself resets once this closes.
        setSubmitted(true);
      } else {
        const originalRoomId = initial?.roomId ?? null;
        const originalBed = initial?.bedNumber ?? null;
        const roomChanged = removedFromRoom
          ? originalRoomId !== null
          : pickedRoomId !== originalRoomId || pickedBed !== originalBed;

        // The only path allowed to move a tenant's room/bed - keeps the
        // Room relation, rent, and the old room's electricity state in
        // sync. Runs before updateTenant so the plain-field save below
        // sees the already-updated roomId.
        if (roomOptions.length > 0 && roomChanged) {
          await assignTenantToRoom(
            manager,
            initial!.id!,
            removedFromRoom ? null : pickedRoomId,
            removedFromRoom ? null : pickedBed
          );
        }

        await updateTenant(manager, initial!.id!, f);
        if (currentAgreement) {
          await updateAgreementFields(manager, initial!.id!, {
            ...agreement,
            roomNumber: f.roomNumber,
            rentAmount: f.rentAmount,
            depositAmount: f.depositAmount,
          });
        }
        toast.success("Tenant updated");
        onOpenChange(false);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="max-h-[92vh] sm:max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {submitted ? "Tenant onboarded" : isNew ? "Onboard a new tenant" : "Edit tenant"}
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {f.name} is onboarded{pickedRoom ? ` into ${pickedRoom.label}` : ""}. Send them their terms now, or
              from their profile anytime later.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={downloadAgreement}>
                <Download className="h-4 w-4" /> Download
              </Button>
              <a href={waLink(f.phone, agreementPreview())} target="_blank" rel="noreferrer" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  <MessageCircle className="h-4 w-4" /> Share on WhatsApp
                </Button>
              </a>
            </div>
            <Button className="w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
        <div className="space-y-4">
          <div>
            <Label className="mb-1">Tenant photo</Label>
            <PhotoUpload value={f.photoUrl} onChange={(url) => set("photoUrl", url)} label="Add tenant photo" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Phone" required>
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="10-digit number" />
            </Field>
            <Field label="Email">
              <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Father's name">
              <Input value={f.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
            </Field>
            <Field label="Mother's name">
              <Input value={f.motherName} onChange={(e) => set("motherName", e.target.value)} />
            </Field>
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Room & rent</p>

          {roomOptions.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>
                  {isNew ? "Room (optional, assign later from Rooms if you'd rather)" : "Room assignment"}
                </Label>
                {isNew && pickedRoomId && (
                  <button
                    type="button"
                    onClick={clearRoomPick}
                    className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
                {!isNew && removedFromRoom && (
                  <button
                    type="button"
                    onClick={() => {
                      setPickedRoomId(initial?.roomId ?? null);
                      setPickedBed(initial?.bedNumber ?? null);
                      setRemovedFromRoom(false);
                    }}
                    className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Undo
                  </button>
                )}
                {!isNew && !removedFromRoom && (pickedRoomId || initial?.roomId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPickedRoomId(null);
                      setPickedBed(null);
                      setRemovedFromRoom(true);
                    }}
                    className="shrink-0 text-[11px] font-semibold text-destructive hover:underline"
                  >
                    Move out (no room)
                  </button>
                )}
              </div>

              {removedFromRoom && (
                <p className="mb-2 text-xs text-destructive">
                  Will be removed from their current room and bed when saved.
                </p>
              )}

              {availableRooms.length === 0 ? (
                <p className="text-xs text-muted-foreground">No beds free right now.</p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                  {floors.map((floor) => (
                    <div key={floor}>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{floor}</p>
                      <div className="space-y-1.5">
                        {availableRooms
                          .filter((r) => r.floorName === floor)
                          .map((room) => (
                            <div
                              key={room.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2"
                            >
                              <span className="shrink-0 text-xs font-semibold">Room {room.number}</span>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {room.freeBeds.map((b) => (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() => pickBed(room, b)}
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                      pickedRoomId === room.id && pickedBed === b
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-input text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    Bed {b}
                                  </button>
                                ))}
                                {room.canTakeWholeRoom && (
                                  <button
                                    type="button"
                                    onClick={() => pickBed(room, FULL_ROOM_BED)}
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                      pickedRoomId === room.id && pickedBed === FULL_ROOM_BED
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-input text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    Full room
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pickedBed && pickedRoom && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Rent set to {inr(pickedBed === FULL_ROOM_BED ? pickedRoom.rentAmount : pickedRoom.perBed)}
                  {pickedBed === FULL_ROOM_BED ? ", the room's full amount" : ", this room's per-bed share"}. Rent
                  is per calendar month: the join month is charged from the day after joining, every month after
                  is due on the 1st.
                </p>
              )}

              {isNew && pickedBed && pickedRoom && (
                <div className="mt-3 border-t border-border/70 pt-3">
                  <Label className="mb-1.5">
                    Current meter reading <span className="text-destructive">*</span>
                  </Label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {pickedRoom.occupied > 0
                      ? "Someone already lives here. Their reading so far will be closed at this number today and billed to them; the new tenant's electricity starts from this number."
                      : "Nobody's living here right now: capture the current meter number and a photo before they move in."}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Meter reading"
                      value={meterStartReading}
                      onChange={(e) => setMeterStartReading(e.target.value)}
                    />
                    <PhotoUpload value={meterStartPhotoUrl} onChange={setMeterStartPhotoUrl} label="Meter photo" />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {roomOptions.length === 0 && (
              <>
                <Field label="Room number">
                  <Input value={f.roomNumber} onChange={(e) => set("roomNumber", e.target.value)} />
                </Field>
                <Field label="Bed number">
                  <Input value={f.bedNumber} onChange={(e) => set("bedNumber", e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Monthly rent" required>
              <Input
                type="number"
                value={f.rentAmount === 0 ? "" : f.rentAmount}
                onChange={(e) => set("rentAmount", e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
            <Field label="Joining date" required>
              <Input type="date" value={f.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
            </Field>
            {isNew && (
              <Field label="Advance payment (paid on joining)">
                <Input
                  type="number"
                  placeholder="0"
                  value={advancePayment}
                  onChange={(e) => setAdvancePayment(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Settles the oldest month first (their join month), then the next. Anything short stays due on
                  the dashboard.
                </p>
                <AdvanceSplitPreview
                  plan={billingPlan}
                  advance={advancePayment === "" ? 0 : Number(advancePayment)}
                  monthlyRent={f.rentAmount}
                />
              </Field>
            )}
          </div>

          {isNew && (
            <BillingPreview
              plan={billingPlan}
              onEdit={(period, amount) => setRentOverrides((o) => ({ ...o, [period]: amount }))}
            />
          )}

          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Security deposit</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Deposit amount" required>
              <Input
                type="number"
                value={f.depositAmount === 0 ? "" : f.depositAmount}
                onChange={(e) => set("depositAmount", e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
            <Field label="Taken as">
              <Select
                items={{ UPI: "UPI", CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHEQUE: "Blank cheque" }}
                value={f.depositMethod}
                onValueChange={(v) => v && set("depositMethod", v as TenantInput["depositMethod"])}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                  <SelectItem value="CHEQUE">Blank cheque</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {f.depositMethod === "CHEQUE" && (
              <>
                <Field label="Cheque number">
                  <Input value={f.depositChequeNumber} onChange={(e) => set("depositChequeNumber", e.target.value)} />
                </Field>
                <Field label="Bank name">
                  <Input value={f.depositChequeBank} onChange={(e) => set("depositChequeBank", e.target.value)} />
                </Field>
              </>
            )}
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Identity & vehicle</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!isNew && (
              <Field label="PAN number">
                <Input value={f.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
              </Field>
            )}
            <Field label="ID proof type">
              <Select value={f.idProofType} onValueChange={(v) => v && set("idProofType", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="College ID">College ID</SelectItem>
                  <SelectItem value="Aadhaar">Aadhaar</SelectItem>
                  <SelectItem value="Passport">Passport</SelectItem>
                  <SelectItem value="Voter ID">Voter ID</SelectItem>
                  <SelectItem value="Driving Licence">Driving Licence</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="ID proof number">
              <Input value={f.idProofNumber} onChange={(e) => set("idProofNumber", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1">{f.idProofType || "ID"} front</Label>
              <PhotoUpload value={f.aadhaarFrontUrl} onChange={(url) => set("aadhaarFrontUrl", url)} label="Upload front" />
            </div>
            <div>
              <Label className="mb-1">{f.idProofType || "ID"} back</Label>
              <PhotoUpload value={f.aadhaarBackUrl} onChange={(url) => set("aadhaarBackUrl", url)} label="Upload back" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Car number">
              <Input value={f.carNumber} onChange={(e) => set("carNumber", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Car model">
              <Input value={f.carModel} onChange={(e) => set("carModel", e.target.value)} />
            </Field>
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Address & emergency</p>
          <Field label="Permanent address">
            <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Emergency contact name">
              <Input value={f.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} />
            </Field>
            <Field label="Emergency phone">
              <Input value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {(isNew || currentAgreement) && (
            <>
              <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                <Field label="Electricity charge per unit">
                  <Input
                    type="number"
                    value={agreement.electricityRate === 0 ? "" : agreement.electricityRate}
                    onChange={(e) =>
                      setAgreement({
                        ...agreement,
                        electricityRate: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isNew ? (
                      <>
                        Filled in from{" "}
                        <Link href="/settings" className="font-semibold text-primary hover:underline">
                          Settings
                        </Link>
                        , {inr(electricityRatePerUnit)} per unit. Change it here just for this tenant if needed.
                      </>
                    ) : (
                      "Updating this changes the tenant's agreement directly, no new version."
                    )}
                  </p>
                </Field>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Extra charges (laundry, food, anything else)
                </p>
                {agreement.facilities.map((fac, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <Input placeholder="What's it for" value={fac.name} onChange={(e) => updateFacility(i, "name", e.target.value)} />
                    <Input
                      placeholder="Amount"
                      type="number"
                      value={fac.amount === 0 ? "" : fac.amount}
                      onChange={(e) => updateFacility(i, "amount", e.target.value === "" ? 0 : Number(e.target.value))}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeFacility(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addFacility}>
                  <Plus className="h-3.5 w-3.5" /> Add extra charge
                </Button>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={saving}>
              {isNew ? "Onboard tenant" : "Save changes"}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

const PREVIEW_LEAD_DAYS = 7;
const PREVIEW_MAX_ROWS = 6;

/**
 * Every rent charge that will land on the books the moment this tenant is
 * saved: the join month pro-rated, then one full month each up to the lead
 * window. Someone entered today but living here since April sees April
 * through the current month listed, each to be settled on its own.
 *
 * Each amount is editable in place - the calculation stays the same, but a
 * pro-rated first month (or any other) can be rounded to whatever was
 * actually agreed before the charge is even created.
 */
function BillingPreview({
  plan,
  onEdit,
}: {
  plan: RentPeriodPlan[];
  onEdit: (period: string, amount: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (plan.length === 0) return null;

  const visible = plan.slice(0, PREVIEW_MAX_ROWS);
  const hidden = plan.length - visible.length;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rent that will be created on save</p>
      <p className="mb-2 mt-1 text-xs text-muted-foreground">
        Rent is per calendar month. The month they join is charged from the day after joining; every month after
        that is due on the 1st and appears {PREVIEW_LEAD_DAYS} days before. Not quite what was agreed? Tap an
        amount to change it.
      </p>
      <div className="divide-y divide-border/70">
        {visible.map((p) => (
          <div key={p.period} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-semibold">{periodLabel(p.period)}</span>
              {p.partial && (
                <span className="text-muted-foreground">
                  {" · "}
                  {dayRangeLabel(p.partial.from, p.partial.to)} · {p.days} days
                </span>
              )}
              <span className="text-muted-foreground"> · due {fmtDate(p.dueDate)}</span>
            </span>
            {editing === p.period ? (
              <Input
                type="number"
                min={0}
                autoFocus
                defaultValue={p.amount}
                className="h-7 w-24 shrink-0 px-2 text-right text-sm"
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0) onEdit(p.period, v);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(p.period)}
                className="flex shrink-0 items-center gap-1 font-semibold hover:text-primary"
              >
                {inr(p.amount)}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        ))}
      </div>
      {hidden > 0 && <p className="mt-1.5 text-xs text-muted-foreground">+{hidden} more month{hidden === 1 ? "" : "s"}</p>}
    </div>
  );
}

/**
 * "1 month, 12 days" - how far a leftover amount reaches at the tenant's
 * normal monthly rate, counting on from whatever period the shown plan
 * already covers. Whole months first, then whatever fraction of the next
 * month's actual day count the remainder buys.
 */
function coverageDuration(amount: number, monthlyRent: number, fromPeriod: string): string {
  if (!(monthlyRent > 0) || !(amount > 0)) return "";
  let remaining = amount;
  let months = 0;
  let period = fromPeriod;
  while (remaining >= monthlyRent - 0.005) {
    remaining = round2(remaining - monthlyRent);
    months++;
    period = addPeriods(period, 1);
  }
  const days = remaining > 0.5 ? Math.round((remaining / monthlyRent) * daysInPeriod(period)) : 0;

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/**
 * How an advance payment (whatever number's typed into that field) would
 * settle against the rent above, oldest month first - same order the real
 * payment allocation uses once the charges actually exist, so what's shown
 * here is what will actually happen on save.
 */
function AdvanceSplitPreview({
  plan,
  advance,
  monthlyRent,
}: {
  plan: RentPeriodPlan[];
  advance: number;
  monthlyRent: number;
}) {
  if (!(advance > 0) || plan.length === 0) return null;
  const { allocations, unallocated } = planAllocations(
    advance,
    plan.map((p) => ({ id: p.period, amount: p.amount, waived: false, allocations: [] }))
  );
  if (allocations.length === 0) return null;

  const duration = unallocated > 0.005 ? coverageDuration(unallocated, monthlyRent, plan[plan.length - 1].period) : "";

  return (
    <div className="mt-2 space-y-1 rounded-lg border border-border bg-background p-2.5 text-xs">
      <p className="font-semibold text-muted-foreground">This splits as:</p>
      {allocations.map((a) => {
        const row = plan.find((p) => p.period === a.chargeId)!;
        const partial = a.amount < row.amount - 0.005;
        return (
          <div key={a.chargeId} className="flex items-center justify-between">
            <span>{periodLabel(row.period)}</span>
            <span className="font-semibold">
              {inr(a.amount)}
              {partial && <span className="ml-1 font-normal text-muted-foreground">of {inr(row.amount)}</span>}
            </span>
          </div>
        );
      })}
      {unallocated > 0.005 && (
        <p className="border-t border-border/70 pt-1 text-primary">
          Remaining {inr(unallocated)} can be settled in {duration || "under a day"} more, once billed.
        </p>
      )}
    </div>
  );
}
