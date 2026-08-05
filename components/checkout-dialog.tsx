"use client";

import { useEffect, useState } from "react";
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
import { Amount, KhataRow } from "@/components/khata";
import type { TenantModel } from "@/lib/generated/prisma/models";
import { toast } from "sonner";

type Settlement = NonNullable<Awaited<ReturnType<typeof getCheckoutSettlement>>>;

const DEDUCTION_CATEGORIES = ["Electricity", "Damage", "Cleaning", "Unpaid rent", "Other"];

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
  const [deductions, setDeductions] = useState<CheckoutDeductionInput[]>([
    { reason: "Outstanding electricity", amount: 0, category: "Electricity" },
  ]);
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

  const validDeductions = deductions.filter((r) => r.reason.trim() && Number(r.amount) > 0);
  const totalDeductions = validDeductions.reduce((s, r) => s + Number(r.amount || 0), 0);
  const unpaidCharges = settlement?.unpaidCharges ?? 0;
  const refund = Number(tenant.depositAmount) - unpaidCharges - totalDeductions;

  async function submit() {
    setSaving(true);
    try {
      await checkoutTenant(manager, tenant.id, {
        checkoutDate,
        deductions: validDeductions,
        refundMethod,
        refundChequeNumber: refundMethod === "CHEQUE" ? refundChequeNumber : undefined,
      });
      toast.success(refund >= 0 ? "Checkout complete — refund recorded" : "Checkout complete — amount owed recorded");
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
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
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

          {settlement && settlement.openCharges.length > 0 && (
            <div className="rounded-lg border border-ledger/30 bg-ledger/5 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ledger">
                Still unpaid — comes out of the deposit
              </p>
              <div className="mt-1">
                {settlement.openCharges.map((c) => (
                  <KhataRow key={c.id} className="py-1.5" amount={<Amount value={c.outstanding} tone="owed" size="sm" />}>
                    <p className="truncate text-sm">{c.description}</p>
                  </KhataRow>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                These are settled automatically at checkout — don&apos;t add them as deductions below as well.
              </p>
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deductions — damage, cleaning, and anything else not already billed
          </p>
          {deductions.map((r, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-2 sm:border-0 sm:p-0">
              <div className="flex gap-2">
                <Select value={r.category} onValueChange={(v) => v && updateRow(i, "category", v)}>
                  <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEDUCTION_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="shrink-0 sm:hidden" onClick={() => removeRow(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Reason" value={r.reason} onChange={(e) => updateRow(i, "reason", e.target.value)} />
                <Input
                  placeholder="Amount"
                  type="number"
                  className="w-28"
                  value={r.amount}
                  onChange={(e) => updateRow(i, "amount", Number(e.target.value))}
                />
                <Button variant="ghost" size="icon" className="hidden shrink-0 sm:flex" onClick={() => removeRow(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Add another charge
          </Button>

          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex justify-between border-b border-border/70 py-1.5 text-sm">
              <span>Deposit held</span>
              <span className="tabular font-semibold">{inr(tenant.depositAmount)}</span>
            </div>
            {unpaidCharges > 0 && (
              <div className="flex justify-between border-b border-border/70 py-1.5 text-sm">
                <span>Less unpaid charges</span>
                <span className="tabular font-semibold text-ledger">− {inr(unpaidCharges)}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-border/70 py-1.5 text-sm">
              <span>Less deductions</span>
              <span className="tabular font-semibold text-ledger">− {inr(totalDeductions)}</span>
            </div>
            <div className="flex items-center justify-between pt-2.5">
              <span className="text-sm font-semibold">
                {refund >= 0 ? "Refundable to tenant" : "Owed by tenant"}
              </span>
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
            This marks the tenant vacated as of the checkout date and records the settlement in the ledger automatically.
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
