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
import { splitEvenly } from "@/lib/charges";
import { toast } from "sonner";

export function MeterReadingDialog({
  open,
  onOpenChange,
  tenantId,
  roomId,
  occupants,
  isMainMeter,
  defaultRate,
  lastReading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string;
  roomId?: string;
  /** Who is sharing this room's meter right now, so the bill is split between them. */
  occupants?: { id: string; name: string }[];
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

  // Previewed with the same function the server uses, so what the owner sees
  // here is exactly what gets billed.
  const shares =
    !isMainMeter && occupants && occupants.length > 0 && amount > 0
      ? splitEvenly(amount, occupants.length).map((value, i) => ({
          id: occupants[i].id,
          name: occupants[i].name,
          amount: value,
        }))
      : [];

  async function submit() {
    if (!startReading || !endReading || invalid) return;
    setSaving(true);
    try {
      await addElectricityBill(manager, {
        tenantId,
        roomId,
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
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex justify-between border-b border-border/70 pb-1.5 text-sm">
              <span>Units consumed</span>
              <span className="tabular font-semibold">{units >= 0 ? units : 0}</span>
            </div>
            <div className="flex justify-between py-1.5 text-sm">
              <span>Bill for this meter</span>
              <span className="tabular font-semibold">{inr(amount >= 0 ? amount : 0)}</span>
            </div>

            {/* The split the owner is about to commit to, shown before they save. */}
            {!isMainMeter && shares.length > 0 && (
              <div className="border-t border-border/70 pt-1.5">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {shares.length > 1 ? `Split ${shares.length} ways` : "Charged to"}
                </p>
                {shares.map((share) => (
                  <div key={share.id} className="flex justify-between py-0.5 text-sm">
                    <span className="truncate text-muted-foreground">{share.name}</span>
                    <span className="tabular font-semibold">{inr(share.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label className="mb-1">Meter photo (optional)</Label>
            <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Upload meter photo" />
          </div>
          {isMainMeter ? (
            <p className="text-xs text-muted-foreground">
              The main meter isn&apos;t billed to anyone. It goes to Expenses, where what tenants repay is netted
              off to show your real electricity cost.
            </p>
          ) : shares.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              Saving this raises a charge on each of the {shares.length} tenants sharing the room. It appears in
              their dues straight away and in the next reminder you send.
            </p>
          ) : occupants && occupants.length === 0 ? (
            <p className="text-xs text-destructive">
              Nobody lives in this room right now, so there is no one to bill. The reading will still be saved.
            </p>
          ) : null}
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
