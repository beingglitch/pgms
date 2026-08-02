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
import { inr, todayISO } from "@/lib/format";
import { toast } from "sonner";

export function MeterReadingDialog({
  open,
  onOpenChange,
  tenantId,
  isMainMeter,
  defaultRate,
  lastReading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string;
  isMainMeter?: boolean;
  defaultRate: number;
  lastReading?: { endReading: number; endDate: string } | null;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [startReading, setStartReading] = useState(
    lastReading ? String(lastReading.endReading) : ""
  );
  const [startDate, setStartDate] = useState(lastReading ? lastReading.endDate.slice(0, 10) : todayISO());
  const [endReading, setEndReading] = useState("");
  const [endDate, setEndDate] = useState(todayISO());
  const [rate, setRate] = useState(String(defaultRate));
  const [photoUrl, setPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const units = Number(endReading || 0) - Number(startReading || 0);
  const amount = units * Number(rate || 0);
  const invalid = endReading !== "" && units < 0;

  async function submit() {
    if (!startReading || !endReading || invalid) return;
    setSaving(true);
    try {
      await addElectricityBill(manager, {
        tenantId,
        isMainMeter,
        startReading: Number(startReading),
        endReading: Number(endReading),
        startDate,
        endDate,
        ratePerUnit: Number(rate),
        photoUrl: photoUrl || undefined,
      });
      toast.success("Meter reading recorded");
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
          <DialogTitle>{isMainMeter ? "Main meter reading" : "Room meter reading"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1">Start reading</Label>
              <Input type="number" value={startReading} onChange={(e) => setStartReading(e.target.value)} />
              {lastReading && <p className="mt-1 text-[11px] text-muted-foreground">Auto-filled from last reading</p>}
            </div>
            <div>
              <Label className="mb-1">Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1">End reading</Label>
              <Input type="number" value={endReading} onChange={(e) => setEndReading(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1">End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {invalid && <p className="text-xs text-destructive">End reading must be greater than start reading.</p>}
          <div>
            <Label className="mb-1">Rate (₹ per unit)</Label>
            <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex justify-between text-sm">
              <span>Units consumed</span>
              <span className="font-semibold">{units >= 0 ? units : 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Amount</span>
              <span className="font-semibold">{inr(amount >= 0 ? amount : 0)}</span>
            </div>
          </div>
          <div>
            <Label className="mb-1">Meter photo (optional)</Label>
            <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Upload meter photo" />
          </div>
          {isMainMeter && (
            <p className="text-xs text-muted-foreground">
              This is not billed to any tenant — it&apos;s automatically added to your Expenses as a recurring
              electricity cost.
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={saving || invalid}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
