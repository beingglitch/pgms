"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoUpload } from "@/components/photo-upload";
import { ZoomableImage } from "@/components/image-viewer";
import { getRoomElectricityContext } from "@/app/actions/electricity";
import { updateDefaultElectricityRate } from "@/app/actions/settings";
import { updateTenantElectricityRate } from "@/app/actions/tenants";
import { useManager } from "@/lib/manager-context";
import { inr, fmtDate, dateISO, todayISO } from "@/lib/format";
import { round2, roomOccupantWeights, splitByWeights } from "@/lib/charges";
import { toast } from "sonner";

type RoomContext = Awaited<ReturnType<typeof getRoomElectricityContext>>;

/**
 * Drives the starting/ending meter reading inputs shared by every "add an
 * electricity charge" flow in the app. Normally the starting number is
 * locked to the room's open reading and the owner only enters the current
 * one; "Enter manually" unlocks it for the rare correction, and a room with
 * no open reading (first bill, or after a reset) starts unlocked since
 * there's nothing to lock to.
 */
export function useElectricityFields(roomId: string | null | undefined, active: boolean, periodEnd: string) {
  const [room, setRoom] = useState<RoomContext | null>(null);
  const [manualStart, setManualStart] = useState(false);
  const [startReading, setStartReading] = useState("");
  const [startDateInput, setStartDateInput] = useState(todayISO());
  const [endReading, setEndReading] = useState("");
  const [endPhotoUrl, setEndPhotoUrl] = useState("");
  const [startPhotoUrl, setStartPhotoUrl] = useState("");
  const [rateOverride, setRateOverride] = useState("");

  useEffect(() => {
    if (!active || !roomId) return;
    let alive = true;
    getRoomElectricityContext(roomId).then((r) => {
      if (!alive) return;
      setRoom(r);
      setManualStart(!r.openReading);
      setStartReading(r.openReading ? String(r.openReading.startReading) : "");
      setEndReading("");
      setEndPhotoUrl("");
      setStartPhotoUrl("");
      setRateOverride("");
      setStartDateInput(todayISO());
    });
    return () => {
      alive = false;
    };
  }, [active, roomId]);

  function toggleManualStart() {
    setManualStart((prev) => {
      const next = !prev;
      setStartReading(next ? "" : room?.openReading ? String(room.openReading.startReading) : "");
      return next;
    });
  }

  const defaultRate = room ? (room.openReading ? Number(room.openReading.ratePerUnit) : Number(room.ratePerUnit)) : 0;
  const effectiveRate = rateOverride !== "" ? Number(rateOverride) : defaultRate;

  const estimate = useMemo(() => {
    if (!room || startReading === "" || endReading === "") return null;
    const start = Number(startReading);
    const end = Number(endReading);
    const units = round2(end - start);
    if (units < 0) return null;

    const billAmount = round2(units * effectiveRate);
    const periodStart = room.openReading ? room.openReading.startDate : startDateInput;
    const weights = roomOccupantWeights(room.occupants, periodStart, periodEnd);
    const shares = splitByWeights(
      billAmount,
      room.occupants.map((o) => weights.get(o.id) ?? 0)
    );

    return {
      units,
      billAmount,
      rate: effectiveRate,
      shares: room.occupants.map((o, i) => ({ id: o.id, name: o.name, amount: shares[i] })),
    };
  }, [room, startReading, endReading, startDateInput, periodEnd, effectiveRate]);

  return {
    room,
    manualStart,
    toggleManualStart,
    startReading,
    setStartReading,
    startDateInput,
    setStartDateInput,
    endReading,
    setEndReading,
    endPhotoUrl,
    setEndPhotoUrl,
    startPhotoUrl,
    setStartPhotoUrl,
    rateOverride,
    setRateOverride,
    defaultRate,
    effectiveRate,
    estimate,
  };
}

export function ElectricityReadingFields({
  fields,
  tenantId,
}: {
  fields: ReturnType<typeof useElectricityFields>;
  /** Lets a rate edit also be applied to this tenant's own agreement, not just this one bill. */
  tenantId?: string;
}) {
  const { manager } = useManager();
  const {
    room,
    manualStart,
    toggleManualStart,
    startReading,
    setStartReading,
    startDateInput,
    setStartDateInput,
    endReading,
    setEndReading,
    endPhotoUrl,
    setEndPhotoUrl,
    startPhotoUrl,
    setStartPhotoUrl,
    rateOverride,
    setRateOverride,
    defaultRate,
    estimate,
  } = fields;

  if (!room) {
    return <p className="text-sm text-muted-foreground">Loading the room&apos;s meter…</p>;
  }

  const rateChanged = rateOverride !== "" && Number(rateOverride) !== defaultRate;

  async function applyRateToTenant() {
    if (!tenantId || rateOverride === "") return;
    await updateTenantElectricityRate(manager, tenantId, Number(rateOverride));
    toast.success("This tenant's electricity rate updated");
  }

  async function applyRateEverywhere() {
    if (rateOverride === "") return;
    await updateDefaultElectricityRate(manager, Number(rateOverride));
    toast.success("Default electricity rate updated");
  }

  const hasStart = startReading !== "";
  // The current reading and the units it implies are the same one number,
  // just expressed two ways - editing either updates the other, so whichever
  // the owner actually knows (the meter's own number, or just "used 40
  // units this month") works without doing the math themselves.
  const unitsValue = hasStart && endReading !== "" ? String(round2(Number(endReading) - Number(startReading))) : "";

  function handleUnitsChange(v: string) {
    if (v.trim() === "") return setEndReading("");
    const units = Number(v);
    if (!Number.isFinite(units)) return;
    // Units alone don't need a known starting number - treat it as zero
    // when there isn't one, so billing purely on "used 40 units" works
    // without making the owner state an absolute meter number first.
    const start = hasStart ? Number(startReading) : 0;
    if (!hasStart) setStartReading("0");
    setEndReading(String(round2(start + units)));
  }

  return (
    <>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <Label>Starting reading</Label>
          {room.openReading && (
            <button
              type="button"
              onClick={toggleManualStart}
              className="text-[11px] font-semibold text-primary"
            >
              {manualStart ? "Use last reading" : "Enter manually"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {room.openReading?.photoUrl && !manualStart && (
            <ZoomableImage
              src={room.openReading.photoUrl}
              alt="Starting meter reading proof"
              downloadName={`meter-start-${dateISO(room.openReading.startDate)}.jpg`}
              thumbClassName="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
            />
          )}
          <Input
            type="number"
            value={startReading}
            onChange={(e) => setStartReading(e.target.value)}
            disabled={!manualStart}
            placeholder={room.openReading ? undefined : "First reading for this room"}
            className="flex-1"
          />
        </div>
        {manualStart && (
          <div className="mt-2">
            <Label className="mb-1.5">
              Starting meter photo <span className="text-destructive">*</span>
            </Label>
            <PhotoUpload value={startPhotoUrl} onChange={setStartPhotoUrl} label="Add meter photo" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5">Current reading</Label>
          <Input
            type="number"
            value={endReading}
            onChange={(e) => setEndReading(e.target.value)}
            disabled={!hasStart}
          />
        </div>
        <div>
          <Label className="mb-1.5">Units used</Label>
          <Input
            type="number"
            value={unitsValue}
            onChange={(e) => handleUnitsChange(e.target.value)}
            placeholder="Or enter this instead"
          />
        </div>
      </div>
      {!hasStart && (
        <p className="text-xs text-muted-foreground">
          Enter the starting reading above to use the current number, or just enter units used directly.
        </p>
      )}

      {endReading !== "" && (
        <div>
          <Label className="mb-1.5">
            Meter photo <span className="text-destructive">*</span>
          </Label>
          <PhotoUpload value={endPhotoUrl} onChange={setEndPhotoUrl} label="Add meter photo" />
          <p className="mt-1 text-xs text-muted-foreground">Proof of this reading - carries over as the next cycle&apos;s starting photo too.</p>
        </div>
      )}

      {!room.openReading && (
        <div>
          <Label className="mb-1.5">Start date</Label>
          <Input type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {room.openReading ? `Since ${fmtDate(room.openReading.startDate)}` : "First electricity reading for this room"}
      </p>

      <div>
        <Label className="mb-1.5">Rate (₹ per unit)</Label>
        <Input
          type="number"
          value={rateOverride !== "" ? rateOverride : defaultRate || ""}
          onChange={(e) => setRateOverride(e.target.value)}
          className="w-32"
        />
        {rateChanged && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">Applies to this bill. Also change it:</span>
            {tenantId && (
              <button type="button" onClick={applyRateToTenant} className="font-semibold text-primary hover:underline">
                For this tenant
              </button>
            )}
            <button type="button" onClick={applyRateEverywhere} className="font-semibold text-primary hover:underline">
              Everywhere
            </button>
          </div>
        )}
      </div>

      {estimate && (
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex justify-between border-b border-border/70 pb-1.5 text-sm">
            <span>{estimate.units} units</span>
            <span className="tabular font-semibold">{inr(estimate.billAmount)}</span>
          </div>
          <p className="mb-1 mt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {estimate.shares.length > 1 ? `Split ${estimate.shares.length} ways` : "Charged to"}
          </p>
          {estimate.shares.map((s) => (
            <div key={s.id} className="flex justify-between py-0.5 text-sm">
              <span className="truncate text-muted-foreground">{s.name}</span>
              <span className="tabular font-semibold">{inr(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
