"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addManualCharge } from "@/app/actions/charges";
import { recordElectricityCharge } from "@/app/actions/electricity";
import { useElectricityFields, ElectricityReadingFields } from "@/components/electricity-fields";
import { useManager } from "@/lib/manager-context";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";
import type { ChargeType } from "@/lib/generated/prisma/enums";

const PRESETS: { type: ChargeType; label: string; description: string }[] = [
  { type: "LAUNDRY", label: "Laundry", description: "Laundry" },
  { type: "OTHER", label: "Damage", description: "Damage recovery" },
  { type: "OTHER", label: "Late fee", description: "Late payment fee" },
  { type: "OTHER", label: "Extra", description: "" },
];

export function ChargeFormDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  roomId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  /** Lets an "Electricity" option connect to the room's meter instead of being a flat manual amount. */
  roomId?: string | null;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [type, setType] = useState<ChargeType>("OTHER");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const [electricityMode, setElectricityMode] = useState(false);
  const elec = useElectricityFields(roomId, electricityMode, dueDate);

  function pickElectricity() {
    setElectricityMode(true);
  }

  function pickPreset(preset: (typeof PRESETS)[number]) {
    setElectricityMode(false);
    setType(preset.type);
    setDescription(preset.description);
  }

  async function save() {
    if (electricityMode) {
      if (!elec.room || !elec.estimate) return toast.error("Enter valid readings to bill.");
      if (!elec.endPhotoUrl) return toast.error("Add a photo of the meter as proof of this reading.");
      setBusy(true);
      const result = await recordElectricityCharge(manager, {
        roomId: roomId!,
        startReading: Number(elec.startReading),
        endReading: Number(elec.endReading),
        endPhotoUrl: elec.endPhotoUrl,
        startDate: elec.room.openReading ? undefined : elec.startDateInput,
        dueDate,
      });
      setBusy(false);
      if (!result) return toast.error("Couldn't bill electricity for that reading.");
      toast.success(
        elec.room.occupants.length > 1
          ? `Electricity billed and split ${elec.room.occupants.length} ways`
          : "Electricity billed"
      );
      onOpenChange(false);
      router.refresh();
      return;
    }

    if (amount <= 0) return toast.error("Enter an amount above zero.");
    if (!description.trim()) return toast.error("Say what the charge is for.");

    setBusy(true);
    await addManualCharge(manager, { tenantId, type, description: description.trim(), amount, dueDate });
    setBusy(false);
    toast.success(`Charge added for ${tenantName}`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a charge for {tenantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => pickPreset(preset)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  !electricityMode && type === preset.type && description === preset.description
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {preset.label}
              </button>
            ))}
            {roomId && (
              <button
                onClick={pickElectricity}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  electricityMode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                Electricity
              </button>
            )}
          </div>

          {electricityMode ? (
            <>
              <ElectricityReadingFields fields={elec} />
              {elec.room && (
                <div>
                  <Label className="mb-1.5">Closing date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <Label className="mb-1.5">What is it for?</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Broken window pane"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">Amount</Label>
                  <Input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="mb-1.5">Due on</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
            </>
          )}

          <Button onClick={save} disabled={busy || (electricityMode && (!elec.estimate || !elec.endPhotoUrl))} className="w-full">
            {electricityMode ? "Bill electricity" : "Add charge"}
          </Button>
          <p className="text-xs text-muted-foreground">
            The next payment from {tenantName} settles their oldest charge first.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
