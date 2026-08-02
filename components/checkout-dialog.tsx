"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { checkoutTenant, type CheckoutDeductionInput } from "@/app/actions/tenants";
import { useManager } from "@/lib/manager-context";
import { inr, todayISO } from "@/lib/format";
import type { TenantModel } from "@/lib/generated/prisma/models";
import { toast } from "sonner";

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
  const [refundMethod, setRefundMethod] = useState<"CASH" | "CHEQUE">(
    tenant.depositMethod === "CHEQUE" ? "CHEQUE" : "CASH"
  );
  const [refundChequeNumber, setRefundChequeNumber] = useState("");
  const [saving, setSaving] = useState(false);

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
  const refund = Number(tenant.depositAmount) - totalDeductions;

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
              Security deposit held ({tenant.depositMethod === "CHEQUE" ? "blank cheque" : "cash"})
            </p>
            <p className="font-semibold">{inr(tenant.depositAmount)}</p>
            {tenant.depositMethod === "CHEQUE" && tenant.depositChequeNumber && (
              <p className="text-xs text-muted-foreground">
                Cheque #{tenant.depositChequeNumber} · {tenant.depositChequeBank}
              </p>
            )}
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deductions — what can be deducted (damage, unpaid electricity, cleaning, etc.)
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

          <div className="rounded-lg bg-amber-100 p-3 dark:bg-amber-950">
            <div className="mb-1 flex justify-between text-sm">
              <span>Total deductions</span>
              <span className="font-semibold">{inr(totalDeductions)}</span>
            </div>
            <div className={`flex justify-between text-base font-bold ${refund < 0 ? "text-destructive" : ""}`}>
              <span>{refund >= 0 ? "Refundable to tenant" : "Additional amount owed by tenant"}</span>
              <span>{inr(Math.abs(refund))}</span>
            </div>
          </div>

          <div>
            <Label className="mb-1">Settle {refund >= 0 ? "refund" : "amount owed"} by</Label>
            <Select
              items={{ CASH: "Cash", CHEQUE: "Cheque" }}
              value={refundMethod}
              onValueChange={(v) => v && setRefundMethod(v as "CASH" | "CHEQUE")}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
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
