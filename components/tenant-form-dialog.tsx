"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoUpload } from "@/components/photo-upload";
import { useManager } from "@/lib/manager-context";
import { createTenant, updateTenant, type TenantInput, type AgreementInput } from "@/app/actions/tenants";
import { todayISO, inr } from "@/lib/format";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { listRoomOptions } from "@/app/actions/rooms";

type ExistingTenant = Partial<TenantInput> & { id?: string };
type RoomOption = Awaited<ReturnType<typeof listRoomOptions>>[number];

export function TenantFormDialog({
  open,
  onOpenChange,
  initial,
  roomOptions = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ExistingTenant | null;
  /** Rooms with a bed free, for the onboarding-only room/bed picker. */
  roomOptions?: RoomOption[];
}) {
  const router = useRouter();
  const { manager } = useManager();
  const isNew = !initial?.id;

  const [f, setF] = useState<TenantInput>({
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
    idProofType: initial?.idProofType || "Aadhaar",
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
  });

  const [agreement, setAgreement] = useState<AgreementInput>({
    roomNumber: f.roomNumber,
    rentAmount: f.rentAmount,
    depositAmount: f.depositAmount,
    depositRefundable: true,
    electricityRate: 8,
    laundryChargeable: true,
    laundryCharge: 300,
    facilities: [],
    photoUrl: "",
    note: "",
  });

  const [saving, setSaving] = useState(false);

  // Onboarding-only bed picker. Room assignment after onboarding still goes
  // through the Rooms page; this just saves a trip for the common case of
  // "this tenant has a bed from day one".
  const [pickedRoomId, setPickedRoomId] = useState<string | null>(null);
  const [pickedBed, setPickedBed] = useState<string | null>(null);
  const [meterStartReading, setMeterStartReading] = useState("");
  const [meterStartPhotoUrl, setMeterStartPhotoUrl] = useState("");
  const pickedRoom = roomOptions.find((r) => r.id === pickedRoomId) ?? null;
  const availableBeds = pickedRoom
    ? Array.from({ length: pickedRoom.capacity }, (_, i) => String(i + 1)).filter(
        (bed) => !pickedRoom.takenBeds.includes(bed)
      )
    : [];

  function pickRoom(roomId: string | null) {
    if (!roomId) {
      setPickedRoomId(null);
      setPickedBed(null);
      return;
    }
    const room = roomOptions.find((r) => r.id === roomId) ?? null;
    setPickedRoomId(roomId);
    const firstFreeBed = room
      ? Array.from({ length: room.capacity }, (_, i) => String(i + 1)).find((b) => !room.takenBeds.includes(b))
      : undefined;
    setPickedBed(firstFreeBed ?? null);
    if (room) {
      setF((s) => ({
        ...s,
        roomNumber: room.number,
        bedNumber: firstFreeBed ?? "",
        // CUSTOM-mode rooms don't set anyone's rent, so leave whatever's typed.
        rentAmount: room.splitModeResolved === "CUSTOM" ? s.rentAmount : room.perBedIfJoining,
      }));
    }
  }

  function set<K extends keyof TenantInput>(key: K, value: TenantInput[K]) {
    setF((s) => ({ ...s, [key]: value }));
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

  async function submit() {
    if (!f.name.trim() || !f.phone.trim()) {
      toast.error("Name and phone are required");
      return;
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
          },
          { ...agreement, roomNumber: f.roomNumber, rentAmount: f.rentAmount, depositAmount: f.depositAmount }
        );
        toast.success(pickedRoom ? `Tenant onboarded into ${pickedRoom.label}` : "Tenant onboarded");
      } else {
        await updateTenant(manager, initial!.id!, f);
        toast.success("Tenant updated");
      }
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Onboard a new tenant" : "Edit tenant"}</DialogTitle>
        </DialogHeader>

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
              <Label className="mb-1.5">Bed (optional, assign later from Rooms if you&apos;d rather)</Label>
              <Select
                value={pickedRoomId ?? "none"}
                onValueChange={(v) => pickRoom(v && v !== "none" ? v : null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
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
                <div className="mt-3">
                  <Label className="mb-1.5">Which bed?</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableBeds.map((bed) => (
                      <button
                        key={bed}
                        type="button"
                        onClick={() => {
                          setPickedBed(bed);
                          set("bedNumber", bed);
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                          pickedBed === bed
                            ? "border-primary bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Bed {bed}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {pickedRoom.splitModeResolved === "CUSTOM"
                      ? "This room uses each tenant's own rent, set it below."
                      : `Rent set to ${inr(pickedRoom.perBedIfJoining)}, this room's share.`}
                  </p>
                </div>
              )}

              {pickedRoom && !pickedRoom.hasMeterReading && (
                <div className="mt-3 border-t border-border/70 pt-3">
                  <Label className="mb-1.5">Starting meter reading</Label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    This room has no reading on file yet. Capture the current number and a photo as proof, so the
                    first electricity bill has a real starting point.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      type="number"
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
              <Input type="number" value={f.rentAmount} onChange={(e) => set("rentAmount", Number(e.target.value))} />
            </Field>
            <Field label="Joining date" required>
              <Input type="date" value={f.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
            </Field>
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Security deposit</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Deposit amount" required>
              <Input type="number" value={f.depositAmount} onChange={(e) => set("depositAmount", Number(e.target.value))} />
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
            <Field label="PAN number">
              <Input value={f.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
            </Field>
            <Field label="ID proof type">
              <Select value={f.idProofType} onValueChange={(v) => v && set("idProofType", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
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
              <Label className="mb-1">Aadhaar front</Label>
              <PhotoUpload value={f.aadhaarFrontUrl} onChange={(url) => set("aadhaarFrontUrl", url)} label="Upload front" />
            </div>
            <div>
              <Label className="mb-1">Aadhaar back</Label>
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

          {isNew && (
            <>
              <div className="border-t pt-3">
                <p className="text-base font-semibold text-primary">Onboarding agreement</p>
                <p className="text-xs text-muted-foreground">
                  Editable later from the tenant profile, and changes create a new dated, shareable version.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Electricity charge per unit">
                  <Input
                    type="number"
                    value={agreement.electricityRate}
                    onChange={(e) => setAgreement({ ...agreement, electricityRate: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Laundry charge / month">
                  <Input
                    type="number"
                    disabled={!agreement.laundryChargeable}
                    value={agreement.laundryCharge}
                    onChange={(e) => setAgreement({ ...agreement, laundryCharge: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={agreement.laundryChargeable} onCheckedChange={(v) => setAgreement({ ...agreement, laundryChargeable: v })} />
                <span className="text-sm">Laundry is chargeable</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={agreement.depositRefundable} onCheckedChange={(v) => setAgreement({ ...agreement, depositRefundable: v })} />
                <span className="text-sm">Security deposit is refundable</span>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Other chargeable facilities
                </p>
                {agreement.facilities.map((fac, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <Input placeholder="Facility name" value={fac.name} onChange={(e) => updateFacility(i, "name", e.target.value)} />
                    <Input
                      placeholder="Amount"
                      type="number"
                      value={fac.amount}
                      onChange={(e) => updateFacility(i, "amount", Number(e.target.value))}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeFacility(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addFacility}>
                  <Plus className="h-3.5 w-3.5" /> Add facility
                </Button>
              </div>

              <div>
                <Label className="mb-1">Agreement copy / signature photo</Label>
                <PhotoUpload value={agreement.photoUrl} onChange={(url) => setAgreement({ ...agreement, photoUrl: url })} />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={saving}>
              {isNew ? "Onboard tenant" : "Save changes"}
            </Button>
          </div>
        </div>
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
