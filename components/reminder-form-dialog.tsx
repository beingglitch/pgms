"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createReminder } from "@/app/actions/reminders";
import { useManager } from "@/lib/manager-context";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";

type TenantOption = { id: string; name: string };

/**
 * A reminder that isn't a dues charge - "renew the agreement", "collect a
 * signature", anything with no other home in the app. Optionally tied to a
 * tenant; a property-wide errand doesn't need one.
 */
export function ReminderFormDialog({
  open,
  onOpenChange,
  tenantOptions,
  defaultTenantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantOptions: TenantOption[];
  /** Pre-selects a tenant, when opened from their own page. */
  defaultTenantId?: string;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [title, setTitle] = useState("");
  const [tenantId, setTenantId] = useState(defaultTenantId ?? "");
  const [dueDate, setDueDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setTitle("");
    setTenantId(defaultTenantId ?? "");
    setDueDate(todayISO());
    setNote("");
    onOpenChange(false);
  }

  async function save() {
    if (!title.trim()) return toast.error("Say what to remember.");
    setSaving(true);
    try {
      await createReminder(manager, {
        tenantId: tenantId || undefined,
        type: "OTHER",
        title: title.trim(),
        dueDate,
        note: note.trim() || undefined,
      });
      toast.success("Reminder added");
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5">What&apos;s it for</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Renew the agreement" autoFocus />
          </div>

          {tenantOptions.length > 0 && (
            <div>
              <Label className="mb-1.5">Tenant (optional)</Label>
              <Select
                value={tenantId || "none"}
                onValueChange={(v) => setTenantId(!v || v === "none" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nobody in particular</SelectItem>
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1.5">Due</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div>
            <Label className="mb-1.5">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any detail worth keeping" />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={save} disabled={saving || !title.trim()}>
              Add reminder
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
