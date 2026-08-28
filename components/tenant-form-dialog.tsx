"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { todayISO, inr, fmtDate } from "@/lib/format";
import { dayRangeLabel, pendingRentPeriods, periodLabel } from "@/lib/charges";
import { waLink } from "@/lib/messaging";
import { Plus, X, Download, MessageCircle } from "lucide-react";
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

  // Onboarding-only bed picker. Room assignment after onboarding still goes
  // through the Rooms page; this just saves a trip for the common case of
  // "this tenant has a bed from day one". The bed itself is never asked for,
  // just the first free one in whatever room is picked.
  const [pickedRoomId, setPickedRoomId] = useState<string | null>(null);
  const [meterStartReading, setMeterStartReading] = useState("");
  const [meterStartPhotoUrl, setMeterStartPhotoUrl] = useState("");
  const [advancePayment, setAdvancePayment] = useState("");
  const pickedRoom = roomOptions.find((r) => r.id === pickedRoomId) ?? null;

  function pickRoom(roomId: string | null) {
    if (!roomId) {
      setPickedRoomId(null);
      return;
    }
    const room = roomOptions.find((r) => r.id === roomId) ?? null;
    setPickedRoomId(roomId);
    const firstFreeBed = room
      ? Array.from({ length: room.capacity }, (_, i) => String(i + 1)).find((b) => !room.takenBeds.includes(b))
      : undefined;
    if (room) {
      setF((s) => ({
        ...s,
        roomNumber: room.number,
        bedNumber: firstFreeBed ?? "",
        rentAmount: room.perBed,
      }));
    }
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
    setMeterStartReading("");
    setMeterStartPhotoUrl("");
    setAdvancePayment("");
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
          },
          { ...agreement, roomNumber: f.roomNumber, rentAmount: f.rentAmount, depositAmount: f.depositAmount }
        );
        toast.success(pickedRoom ? `Tenant onboarded into ${pickedRoom.label}` : "Tenant onboarded");
        router.refresh();
        // Stay open so the download/share buttons below have something to
        // hand over; the form itself resets once this closes.
        setSubmitted(true);
      } else {
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
    } catch {
      toast.error("Something went wrong");
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

          {isNew && roomOptions.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <Label className="mb-1.5">Room (optional, assign later from Rooms if you&apos;d rather)</Label>
              <Select
                value={pickedRoomId ?? "none"}
                onValueChange={(v) => pickRoom(v && v !== "none" ? v : null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === "none" || !value ? "No room yet" : (roomOptions.find((r) => r.id === value)?.label ?? "No room yet")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No room yet</SelectItem>
                  {roomOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id} disabled={r.occupied >= r.capacity}>
                      {r.label} ({r.capacity - r.occupied} bed{r.capacity - r.occupied === 1 ? "" : "s"} free)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {pickedRoom && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Bed assigned automatically (first free one). Rent set to {inr(pickedRoom.perBed)}, this
                  room&apos;s per-bed share. Rent is per calendar month: the join month is charged from the day
                  after joining, every month after is due on the 1st.
                </p>
              )}

              {pickedRoom && (
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
            {(!isNew || roomOptions.length === 0 || !pickedRoomId) && (
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
              </Field>
            )}
          </div>

          {isNew && <BillingPreview rentAmount={f.rentAmount} joinDate={f.joinDate} />}

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
                    {isNew
                      ? `Filled in from Settings, ${inr(electricityRatePerUnit)} per unit. Change it here just for this tenant if needed.`
                      : "Updating this changes the tenant's agreement directly, no new version."}
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
          {isNew && (
            <p className="text-center text-xs text-muted-foreground">
              This whole form is the onboarding agreement. Editable later from the tenant&apos;s profile, in place,
              no versioning.
            </p>
          )}
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
 */
function BillingPreview({ rentAmount, joinDate }: { rentAmount: number; joinDate: string }) {
  const join = new Date(joinDate);
  if (!(rentAmount > 0) || !joinDate || isNaN(join.getTime())) return null;

  const plans = pendingRentPeriods(rentAmount, joinDate, new Date(), PREVIEW_LEAD_DAYS, new Set());
  if (plans.length === 0) return null;

  const visible = plans.slice(0, PREVIEW_MAX_ROWS);
  const hidden = plans.length - visible.length;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rent that will be created on save</p>
      <p className="mb-2 mt-1 text-xs text-muted-foreground">
        Rent is per calendar month. The month they join is charged from the day after joining; every month after
        that is due on the 1st and appears {PREVIEW_LEAD_DAYS} days before.
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
            <span className="tabular shrink-0 font-semibold">{inr(p.amount)}</span>
          </div>
        ))}
      </div>
      {hidden > 0 && <p className="mt-1.5 text-xs text-muted-foreground">+{hidden} more month{hidden === 1 ? "" : "s"}</p>}
    </div>
  );
}
