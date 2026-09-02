"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustChargeAmount } from "@/app/actions/charges";
import { useManager } from "@/lib/manager-context";
import { inr } from "@/lib/format";
import { toast } from "sonner";

/**
 * Settle a charge for something other than what it was originally billed at
 * - the common case being a pro-rated first month (₹8,333) rounded down to
 * a flat number both sides agreed on (₹8,000). Changes the charge's amount
 * directly, so it's fully closed once the new amount is paid, rather than
 * leaving the difference sitting outstanding.
 */
export function AdjustChargeDialog({
  open,
  onOpenChange,
  charge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charge: { id: string; description: string; amount: number; paid: number };
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [amount, setAmount] = useState(String(charge.amount));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = Number(amount);
  const invalid = amount.trim() === "" || !Number.isFinite(parsed) || parsed < 0;
  const belowPaid = !invalid && parsed < charge.paid;

  async function save() {
    if (invalid) return toast.error("Enter a valid amount.");
    if (belowPaid) return toast.error(`Already paid ${inr(charge.paid)} against this.`);
    setSaving(true);
    try {
      await adjustChargeAmount(manager, charge.id, parsed, note.trim() || undefined);
      toast.success(`Charge updated to ${inr(parsed)}`);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the charge.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settle for a different amount</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{charge.description}</span> was billed at{" "}
            {inr(charge.amount)}
            {charge.paid > 0 ? `, ${inr(charge.paid)} already paid` : ""}. Set what it should actually settle for.
          </p>
          <div>
            <Label className="mb-1">New amount</Label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            {belowPaid && (
              <p className="mt-1 text-xs text-destructive">
                Can&apos;t go below the {inr(charge.paid)} already paid against this.
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Agreed with tenant to round down" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={save} disabled={saving || invalid || belowPaid}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
