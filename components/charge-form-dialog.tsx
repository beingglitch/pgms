"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addManualCharge } from "@/app/actions/charges";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [type, setType] = useState<ChargeType>("OTHER");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  async function save() {
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
                onClick={() => {
                  setType(preset.type);
                  setDescription(preset.description);
                }}
                className="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div>
            <Label className="mb-1.5">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ChargeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RENT">Rent</SelectItem>
                <SelectItem value="ELECTRICITY">Electricity</SelectItem>
                <SelectItem value="LAUNDRY">Laundry</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          <Button onClick={save} disabled={busy} className="w-full">
            Add charge
          </Button>
          <p className="text-xs text-muted-foreground">
            The next payment from {tenantName} settles their oldest charge first.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
