"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addReminder } from "@/app/actions/reminders";
import { useManager } from "@/lib/manager-context";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";
import type { TenantModel } from "@/lib/generated/prisma/models";

export function ReminderFormDialog({
  open,
  onOpenChange,
  tenants,
  fixedTenantId,
  defaultAmount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: Pick<TenantModel, "id" | "name" | "roomNumber">[];
  fixedTenantId?: string;
  defaultAmount?: number;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [tenantId, setTenantId] = useState(fixedTenantId || tenants[0]?.id || "");
  const [type, setType] = useState<"RENT" | "ELECTRICITY" | "OTHER">("RENT");
  const tenantItems = Object.fromEntries(tenants.map((t) => [t.id, `${t.name} — Room ${t.roomNumber || "-"}`]));
  const [title, setTitle] = useState("Rent due");
  const [dueDate, setDueDate] = useState(todayISO());
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!tenantId || !dueDate) return;
    setSaving(true);
    try {
      await addReminder(manager, {
        tenantId,
        type,
        title,
        dueDate,
        amount: amount ? Number(amount) : undefined,
        note: note || undefined,
      });
      toast.success("Reminder saved");
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
          <DialogTitle>New reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!fixedTenantId && (
            <div>
              <Label className="mb-1">Tenant</Label>
              <Select items={tenantItems} value={tenantId} onValueChange={(v) => v && setTenantId(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} — Room {t.roomNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="mb-1">Reminder type</Label>
            <Select
              items={{ RENT: "Rent not paid", ELECTRICITY: "Electricity bill", OTHER: "Other" }}
              value={type}
              onValueChange={(v) => v && setType(v as typeof type)}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RENT">Rent not paid</SelectItem>
                <SelectItem value="ELECTRICITY">Electricity bill</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Amount (optional)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={submit} disabled={saving}>
              Save reminder
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
