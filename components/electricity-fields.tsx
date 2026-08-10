"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRoomElectricityContext } from "@/app/actions/electricity";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { round2, roomOccupantWeights, splitByWeights } from "@/lib/charges";

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

  useEffect(() => {
    if (!active || !roomId) return;
    let alive = true;
    getRoomElectricityContext(roomId).then((r) => {
      if (!alive) return;
      setRoom(r);
      setManualStart(!r.openReading);
      setStartReading(r.openReading ? String(r.openReading.startReading) : "");
      setEndReading("");
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

  const estimate = useMemo(() => {
    if (!room || startReading === "" || endReading === "") return null;
    const start = Number(startReading);
    const end = Number(endReading);
    const units = round2(end - start);
    if (units < 0) return null;

    const rate = room.openReading ? Number(room.openReading.ratePerUnit) : Number(room.ratePerUnit);
    const billAmount = round2(units * rate);
    const periodStart = room.openReading ? room.openReading.startDate : startDateInput;
    const weights = roomOccupantWeights(room.occupants, periodStart, periodEnd);
    const shares = splitByWeights(
      billAmount,
      room.occupants.map((o) => weights.get(o.id) ?? 0)
    );

    return {
      units,
      billAmount,
      rate,
      shares: room.occupants.map((o, i) => ({ id: o.id, name: o.name, amount: shares[i] })),
    };
  }, [room, startReading, endReading, startDateInput, periodEnd]);

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
    estimate,
  };
}

export function ElectricityReadingFields({ fields }: { fields: ReturnType<typeof useElectricityFields> }) {
  const { room, manualStart, toggleManualStart, startReading, setStartReading, startDateInput, setStartDateInput, endReading, setEndReading, estimate } =
    fields;

  if (!room) {
    return <p className="text-sm text-muted-foreground">Loading the room&apos;s meter…</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
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
          <Input
            type="number"
            value={startReading}
            onChange={(e) => setStartReading(e.target.value)}
            disabled={!manualStart}
            placeholder={room.openReading ? undefined : "First reading for this room"}
          />
        </div>
        <div>
          <Label className="mb-1.5">Current reading</Label>
          <Input type="number" value={endReading} onChange={(e) => setEndReading(e.target.value)} />
        </div>
      </div>

      {!room.openReading && (
        <div>
          <Label className="mb-1.5">Start date</Label>
          <Input type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {room.openReading ? `Since ${fmtDate(room.openReading.startDate)}` : "First electricity reading for this room"} ·{" "}
        {inr(room.openReading ? Number(room.openReading.ratePerUnit) : Number(room.ratePerUnit))}/unit.
      </p>

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
