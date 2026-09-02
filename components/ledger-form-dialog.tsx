"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addLedgerEntry } from "@/app/actions/ledger";
import { adjustChargeAmount } from "@/app/actions/charges";
import { updateTenant } from "@/app/actions/tenants";
import { useManager } from "@/lib/manager-context";
import { inr, todayISO } from "@/lib/format";
import { toast } from "sonner";
import type { TenantModel } from "@/lib/generated/prisma/models";

const TYPE_ITEMS = { RENT: "Rent", DEPOSIT: "Deposit", OTHER: "Other" };
const MODE_ITEMS = { UPI: "UPI", CASH: "Cash", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque" };
const RENT_STEP = 100;

export function LedgerFormDialog({
  open,
  onOpenChange,
  tenants,
  fixedTenantId,
  defaultAmount,
  outstandingAmount,
  chargeId,
  chargeLabel,
  chargeType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: (Pick<TenantModel, "id" | "name" | "roomNumber"> & { rentAmount: number | string | { toString(): string } })[];
  fixedTenantId?: string;
  defaultAmount?: number;
  /**
   * Set when this dialog is settling a specific tenant's dues rather than
   * just recording a payment. Pre-fills the full outstanding amount, and
   * switches the amount field's helper text from "does this change their
   * rent going forward" (irrelevant here) to "how much is left after this".
   */
  outstandingAmount?: number;
  /**
   * Paying off one specific charge (one month's rent, say): that charge is
   * settled first, with only any remainder flowing to the others. The type
   * follows the charge and isn't asked for.
   */
  chargeId?: string;
  /** What that charge is, for the "Paying: ..." line, e.g. "Rent · August 2026". */
  chargeLabel?: string;
  chargeType?: "RENT" | "ELECTRICITY" | "LAUNDRY" | "OTHER";
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [tenantId, setTenantId] = useState(fixedTenantId || tenants[0]?.id || "");
  const [type, setType] = useState<"RENT" | "DEPOSIT" | "OTHER">(chargeId ? (chargeType === "RENT" ? "RENT" : "OTHER") : "RENT");
  const [amount, setAmount] = useState(() => {
    if (outstandingAmount) return String(outstandingAmount);
    if (defaultAmount) return String(defaultAmount);
    const initialTenant = tenants.find((t) => t.id === (fixedTenantId || tenants[0]?.id));
    return initialTenant ? String(Number(initialTenant.rentAmount)) : "";
  });
  const [amountTouched, setAmountTouched] = useState(!!defaultAmount || !!outstandingAmount);
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState("UPI");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [rentPrompt, setRentPrompt] = useState(false);

  const tenantItems = Object.fromEntries(tenants.map((t) => [t.id, `${t.name}, Room ${t.roomNumber || "-"}`]));
  const selectedTenant = tenants.find((t) => t.id === tenantId);

  function selectTenant(id: string) {
    setTenantId(id);
    const t = tenants.find((x) => x.id === id);
    if (type === "RENT" && t && !amountTouched) {
      setAmount(String(Number(t.rentAmount)));
    }
  }

  function selectType(v: "RENT" | "DEPOSIT" | "OTHER") {
    setType(v);
    if (v === "RENT" && selectedTenant && !amountTouched) {
      setAmount(String(Number(selectedTenant.rentAmount)));
    }
  }

  function adjustAmount(delta: number) {
    setAmountTouched(true);
    setAmount((a) => String(Math.max(0, Number(a || 0) + delta)));
  }

  // Settling dues is a different question from "did the monthly rent change":
  // an odd partial amount against outstanding shouldn't prompt "should this
  // be their new rent going forward?".
  const rentChanged =
    outstandingAmount === undefined &&
    !chargeId &&
    type === "RENT" &&
    !!selectedTenant &&
    amount !== "" &&
    Number(amount) !== Number(selectedTenant.rentAmount);

  const remainingAfterPayment =
    outstandingAmount !== undefined ? Math.max(0, outstandingAmount - Number(amount || 0)) : undefined;

  async function submit() {
    if (!tenantId || !amount) return;
    if (rentChanged) {
      setRentPrompt(true);
      return;
    }
    await save();
  }

  async function save(permanentRentChange?: boolean) {
    setSaving(true);
    try {
      if (permanentRentChange && selectedTenant) {
        await updateTenant(manager, selectedTenant.id, { rentAmount: Number(amount) });
      }
      await addLedgerEntry(manager, { tenantId, type, amount: Number(amount), date, mode, note: note || undefined, chargeId });
      toast.success("Transaction recorded");
      setRentPrompt(false);
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  /**
   * Whatever's typed in Amount becomes what this charge actually settles
   * for - not a payment toward the original bill, the bill itself changes
   * to match (e.g. billed ₹9,000, tenant and owner agree on ₹8,000 - or
   * ₹10,000 - and that's what's now owed and what's now recorded as paid).
   * "Save" still records a plain payment without touching the bill; this is
   * for when the two disagree.
   */
  async function settle() {
    if (!tenantId || !amount || !chargeId) return;
    setSaving(true);
    try {
      await adjustChargeAmount(manager, chargeId, Number(amount));
      await addLedgerEntry(manager, { tenantId, type, amount: Number(amount), date, mode, note: note || undefined, chargeId });
      toast.success(`Settled for ${inr(Number(amount))}`);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't settle this charge.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{outstandingAmount !== undefined ? "Record payment" : "Record a transaction"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {chargeId ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              Paying: <span className="font-semibold">{chargeLabel ?? "this charge"}</span>
              {outstandingAmount !== undefined && (
                <span className="text-muted-foreground"> ({inr(outstandingAmount)} outstanding)</span>
              )}
            </p>
          ) : (
            outstandingAmount !== undefined && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="font-semibold">{selectedTenant?.name}</span> owes{" "}
                <span className="font-semibold">{inr(outstandingAmount)}</span> right now.
              </p>
            )
          )}
          {!fixedTenantId && (
            <div>
              <Label className="mb-1">Tenant</Label>
              <Select items={tenantItems} value={tenantId} onValueChange={(v) => v && selectTenant(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}, Room {t.roomNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {outstandingAmount === undefined && !chargeId && (
            <div>
              <Label className="mb-1">Type</Label>
              <Select items={TYPE_ITEMS} value={type} onValueChange={(v) => v && selectType(v as typeof type)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RENT">Rent</SelectItem>
                  <SelectItem value="DEPOSIT">Deposit</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="mb-1">Amount</Label>
            {type === "RENT" ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => adjustAmount(-RENT_STEP)}>
                  −
                </Button>
                <Input
                  type="number"
                  className="text-center"
                  value={amount}
                  onChange={(e) => {
                    setAmountTouched(true);
                    setAmount(e.target.value);
                  }}
                />
                <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => adjustAmount(RENT_STEP)}>
                  +
                </Button>
              </div>
            ) : (
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
            {rentChanged && (
              <p className="mt-1 text-xs text-amber-700">
                Decided rent is {inr(Number(selectedTenant!.rentAmount))}. You&apos;ll be asked how to save this.
              </p>
            )}
            {remainingAfterPayment !== undefined && (
              <p className="mt-1 text-xs text-muted-foreground">
                {remainingAfterPayment > 0
                  ? `${inr(remainingAfterPayment)} still left ${chargeId ? "on this charge" : ""} after this payment.`
                  : chargeId
                    ? "Settles this charge. Anything extra goes to their oldest other dues."
                    : "Settles everything they owe."}
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Payment mode</Label>
            <Select items={MODE_ITEMS} value={mode} onValueChange={(v) => v && setMode(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {chargeId && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Save</span> records this as a payment toward the{" "}
              {inr(outstandingAmount ?? 0)} billed.{" "}
              <span className="font-semibold text-foreground">Settle</span> instead makes {inr(Number(amount || 0))}{" "}
              the actual amount owed and marks it paid in full.
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {chargeId && (
              <Button variant="secondary" className="flex-1" onClick={settle} disabled={saving || !amount}>
                Settle
              </Button>
            )}
            <Button className="flex-1" onClick={submit} disabled={saving}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>

      <Dialog open={rentPrompt} onOpenChange={setRentPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rent amount changed</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedTenant?.name}&apos;s decided rent is {inr(Number(selectedTenant?.rentAmount ?? 0))}, but you entered{" "}
            {inr(Number(amount || 0))}. Should this apply just to this entry, or become the tenant&apos;s new rent going
            forward?
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={() => save(true)} disabled={saving}>
              Change permanently
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              Just this once
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
