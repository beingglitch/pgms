"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { checkoutTenant, type CheckoutDeductionInput, type PaymentMethod } from "@/app/actions/tenants";
import { getCheckoutSettlement } from "@/app/actions/reports";
import { useManager } from "@/lib/manager-context";
import { inr, todayISO, paymentMethodLabel } from "@/lib/format";
import { round2, roomOccupantWeights, splitByWeights } from "@/lib/charges";
import { Amount } from "@/components/khata";
import type { TenantModel } from "@/lib/generated/prisma/models";
import { toast } from "sonner";

type Settlement = NonNullable<Awaited<ReturnType<typeof getCheckoutSettlement>>>;

export function CheckoutDialog({
  open,
  onOpenChange,
  tenant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: TenantModel;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [checkoutDate, setCheckoutDate] = useState(todayISO());
  const [finalReading, setFinalReading] = useState("");
  const [deductions, setDeductions] = useState<CheckoutDeductionInput[]>([]);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>(tenant.depositMethod as PaymentMethod);
  const [refundChequeNumber, setRefundChequeNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [settlement, setSettlement] = useState<Settlement | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    getCheckoutSettlement(tenant.id).then((s) => active && setSettlement(s));
    return () => {
      active = false;
    };
  }, [open, tenant.id]);

  function addRow() {
    setDeductions((d) => [...d, { reason: "", amount: 0, category: "Other" }]);
  }
  function updateRow(i: number, key: keyof CheckoutDeductionInput, value: string | number) {
    setDeductions((d) => d.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }
  function removeRow(i: number) {
    setDeductions((d) => d.filter((_, idx) => idx !== i));
  }

  // Same math billRoomElectricity will use on confirm: units since the
  // reading opened, split by days actually shared with whoever else is
  // still in the room, so this tenant only pays their slice.
  const electricityEstimate = useMemo(() => {
    const reading = settlement?.openReading;
    if (!reading || finalReading === "") return null;
    const units = round2(Number(finalReading) - reading.startReading);
    if (units < 0) return null;
    const amount = round2(units * reading.ratePerUnit);

    const occupants = [{ id: tenant.id, joinDate: tenant.joinDate }, ...(settlement?.roommates ?? [])];
    const weights = roomOccupantWeights(occupants, reading.startDate, checkoutDate);
    const shares = splitByWeights(
      amount,
      occupants.map((o) => weights.get(o.id) ?? 0)
    );
    return { units, amount, share: shares[0] };
  }, [settlement, finalReading, checkoutDate, tenant.id, tenant.joinDate]);

  const validDeductions = deductions.filter((r) => r.reason.trim() && Number(r.amount) > 0);
  const totalDeductions = validDeductions.reduce((s, r) => s + Number(r.amount || 0), 0);
  const remainingRent = settlement?.byType.rent ?? 0;
  const billedElectricity = settlement?.byType.electricity ?? 0;
  const otherUnpaid = settlement?.byType.other ?? 0;
  const estimatedElectricity = electricityEstimate?.share ?? 0;
  const totalOwed = round2(remainingRent + billedElectricity + otherUnpaid + estimatedElectricity);
  const refund = round2(Number(tenant.depositAmount) - totalOwed - totalDeductions);

  async function submit() {
    setSaving(true);
    try {
      await checkoutTenant(manager, tenant.id, {
        checkoutDate,
        deductions: validDeductions,
        refundMethod,
        refundChequeNumber: refundMethod === "CHEQUE" ? refundChequeNumber : undefined,
        finalMeterReading: finalReading !== "" ? Number(finalReading) : undefined,
      });
      toast.success(refund >= 0 ? "Checkout complete, refund recorded" : "Checkout complete, amount owed recorded");
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
      <DialogContent className="max-h-[92vh] sm:max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkout & deposit settlement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1">Checkout date</Label>
            <Input type="date" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} />
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Security deposit held ({paymentMethodLabel(tenant.depositMethod)})
            </p>
            <p className="font-semibold">{inr(tenant.depositAmount)}</p>
            {tenant.depositMethod === "CHEQUE" && tenant.depositChequeNumber && (
              <p className="text-xs text-muted-foreground">
                Cheque #{tenant.depositChequeNumber} · {tenant.depositChequeBank}
              </p>
            )}
          </div>

          {remainingRent > 0.005 && (
            <div className="flex items-center justify-between rounded-lg border border-ledger/30 bg-ledger/5 px-3 py-2">
              <span className="text-sm">Remaining rent</span>
              <Amount value={remainingRent} tone="owed" size="sm" />
            </div>
          )}

          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Electricity</p>
            {billedElectricity > 0.005 && (
              <div className="mt-1 flex items-center justify-between text-sm">
                <span>Already billed, unpaid</span>
                <Amount value={billedElectricity} tone="owed" size="sm" />
              </div>
            )}
            {settlement?.openReading ? (
              <>
                <div className="mt-2">
                  <Label className="mb-1 text-xs">Current meter reading (started at {settlement.openReading.startReading})</Label>
                  <Input
                    type="number"
                    placeholder="Read the meter now"
                    value={finalReading}
                    onChange={(e) => setFinalReading(e.target.value)}
                  />
                </div>
                {electricityEstimate && (
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span>
                      {electricityEstimate.units} units
                      {settlement.roommates.length > 0 ? ", this tenant&apos;s share" : ""}
                    </span>
                    <Amount value={electricityEstimate.share} tone="owed" size="sm" />
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {settlement.roommates.length > 0
                    ? `Split by days actually shared with ${settlement.roommates.map((r) => r.name).join(", ")}.`
                    : "Nobody else has shared this room's meter since it was opened, so this is billed in full."}
                </p>
              </>
            ) : billedElectricity <= 0.005 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nothing outstanding, no reading in progress.</p>
            ) : null}
          </div>

          {otherUnpaid > 0.005 && (
            <div className="flex items-center justify-between rounded-lg border border-ledger/30 bg-ledger/5 px-3 py-2">
              <span className="text-sm">Other unpaid charges</span>
              <Amount value={otherUnpaid} tone="owed" size="sm" />
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Extra charges: damage, cleaning, or anything else not already billed
          </p>
          {deductions.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Reason" value={r.reason} onChange={(e) => updateRow(i, "reason", e.target.value)} />
              <Input
                placeholder="Amount"
                type="number"
                className="w-28"
                value={r.amount === 0 ? "" : r.amount}
                onChange={(e) => updateRow(i, "amount", e.target.value === "" ? 0 : Number(e.target.value))}
              />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeRow(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Add extra charge
          </Button>

          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex justify-between border-b border-border/70 py-1.5 text-sm">
              <span>Deposit held</span>
              <span className="tabular font-semibold">{inr(tenant.depositAmount)}</span>
            </div>
            {totalOwed > 0.005 && (
              <div className="flex justify-between border-b border-border/70 py-1.5 text-sm">
                <span>Less rent & electricity owed</span>
                <span className="tabular font-semibold text-ledger">− {inr(totalOwed)}</span>
              </div>
            )}
            {totalDeductions > 0 && (
              <div className="flex justify-between border-b border-border/70 py-1.5 text-sm">
                <span>Less extra charges</span>
                <span className="tabular font-semibold text-ledger">− {inr(totalDeductions)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2.5">
              <span className="text-sm font-semibold">{refund >= 0 ? "Net refund to tenant" : "Net owed by tenant"}</span>
              <Amount value={Math.abs(refund)} tone={refund >= 0 ? "positive" : "owed"} size="lg" />
            </div>
          </div>

          <div>
            <Label className="mb-1">Settle {refund >= 0 ? "refund" : "amount owed"} by</Label>
            <Select
              items={{ UPI: "UPI", CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque" }}
              value={refundMethod}
              onValueChange={(v) => v && setRefundMethod(v as PaymentMethod)}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
              </SelectContent>
            </Select>
            {refundMethod === "CHEQUE" && (
              <Input
                className="mt-2"
                placeholder="Cheque number"
                value={refundChequeNumber}
                onChange={(e) => setRefundChequeNumber(e.target.value)}
              />
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            This marks the tenant vacated as of the checkout date and records the settlement in the ledger
            automatically. Entering a current meter reading above also closes the room&apos;s electricity reading.
          </p>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={saving}>
              Confirm checkout
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
