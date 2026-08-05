"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PhotoUpload } from "@/components/photo-upload";
import { Plus, X } from "lucide-react";
import { reviseAgreement, type AgreementInput } from "@/app/actions/tenants";
import { useManager } from "@/lib/manager-context";
import { toast } from "sonner";
import type { AgreementModel } from "@/lib/generated/prisma/models";

export function AgreementFormDialog({
  open,
  onOpenChange,
  tenantId,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  current: AgreementModel;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [a, setA] = useState<AgreementInput>({
    roomNumber: current.roomNumber || "",
    rentAmount: Number(current.rentAmount),
    depositAmount: Number(current.depositAmount),
    depositRefundable: current.depositRefundable,
    electricityRate: Number(current.electricityRate),
    laundryChargeable: current.laundryChargeable,
    laundryCharge: Number(current.laundryCharge),
    facilities: (current.facilities as { name: string; amount: number }[]) || [],
    photoUrl: current.photoUrl || "",
    note: current.note || "",
  });
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);

  function addFacility() {
    setA((s) => ({ ...s, facilities: [...s.facilities, { name: "", amount: 0 }] }));
  }
  function updateFacility(i: number, key: "name" | "amount", value: string | number) {
    setA((s) => ({ ...s, facilities: s.facilities.map((f, idx) => (idx === i ? { ...f, [key]: value } : f)) }));
  }
  function removeFacility(i: number) {
    setA((s) => ({ ...s, facilities: s.facilities.filter((_, idx) => idx !== i) }));
  }

  async function submit() {
    setSaving(true);
    try {
      await reviseAgreement(manager, tenantId, a, changeNote);
      toast.success(`Agreement revised to v${current.version + 1}`);
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revise agreement, v{current.version + 1}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1">Room number</Label>
              <Input value={a.roomNumber} onChange={(e) => setA({ ...a, roomNumber: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1">Monthly rent</Label>
              <Input type="number" value={a.rentAmount} onChange={(e) => setA({ ...a, rentAmount: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="mb-1">Security deposit</Label>
              <Input type="number" value={a.depositAmount} onChange={(e) => setA({ ...a, depositAmount: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="mb-1">Electricity per unit</Label>
              <Input
                type="number"
                value={a.electricityRate}
                onChange={(e) => setA({ ...a, electricityRate: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="mb-1">Laundry charge / month</Label>
              <Input
                type="number"
                disabled={!a.laundryChargeable}
                value={a.laundryCharge}
                onChange={(e) => setA({ ...a, laundryCharge: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={a.laundryChargeable} onCheckedChange={(v) => setA({ ...a, laundryChargeable: v })} />
            <span className="text-sm">Laundry is chargeable</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={a.depositRefundable} onCheckedChange={(v) => setA({ ...a, depositRefundable: v })} />
            <span className="text-sm">Security deposit is refundable</span>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Other chargeable facilities
            </p>
            {a.facilities.map((fac, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Input placeholder="Facility name" value={fac.name} onChange={(e) => updateFacility(i, "name", e.target.value)} />
                <Input
                  placeholder="Amount"
                  type="number"
                  value={fac.amount}
                  onChange={(e) => updateFacility(i, "amount", Number(e.target.value))}
                />
                <Button variant="ghost" size="icon" onClick={() => removeFacility(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addFacility}>
              <Plus className="h-3.5 w-3.5" /> Add facility
            </Button>
          </div>

          <div>
            <Label className="mb-1">Agreement copy / signature photo</Label>
            <PhotoUpload value={a.photoUrl} onChange={(url) => setA({ ...a, photoUrl: url })} />
          </div>

          <div>
            <Label className="mb-1">What changed and why</Label>
            <Input
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="e.g. Electricity rate increased from ₹8 to ₹10/unit"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={saving}>
              Save revised agreement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
