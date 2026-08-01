"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PhotoUpload } from "@/components/photo-upload";
import { addElectricityBill } from "@/app/actions/electricity";
import { useManager } from "@/lib/manager-context";
import { todayISO, monthKey } from "@/lib/format";
import { toast } from "sonner";

export function ElectricityBillDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [date, setDate] = useState(todayISO());
  const [units, setUnits] = useState("");
  const [amount, setAmount] = useState("");
  const [billPhotoUrl, setBillPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!amount) return;
    setSaving(true);
    try {
      await addElectricityBill(manager, {
        tenantId,
        month: monthKey(date),
        units: units ? Number(units) : undefined,
        amount: Number(amount),
        billPhotoUrl: billPhotoUrl || undefined,
        date,
      });
      toast.success("Electricity bill recorded");
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record electricity bill</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1">Bill photo</Label>
            <PhotoUpload value={billPhotoUrl} onChange={setBillPhotoUrl} label="Upload meter/bill photo" />
          </div>
          <div>
            <Label className="mb-1">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Units consumed (optional)</Label>
            <Input type="number" value={units} onChange={(e) => setUnits(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={saving}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
