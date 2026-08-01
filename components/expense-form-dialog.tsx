"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhotoUpload } from "@/components/photo-upload";
import { addExpense } from "@/app/actions/expenses";
import { useManager } from "@/lib/manager-context";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";

const CATEGORIES = ["Maid", "Wifi", "Repairs", "Groceries", "Water", "Gas", "Staff salary", "Maintenance", "Other"];

export function ExpenseFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { manager } = useManager();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Maid");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"ONE_TIME" | "MONTHLY" | "YEARLY">("ONE_TIME");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !amount) return;
    setSaving(true);
    try {
      await addExpense(manager, {
        title,
        category,
        amount: Number(amount),
        frequency,
        date,
        note: note || undefined,
        receiptUrl: receiptUrl || undefined,
      });
      toast.success("Expense recorded");
      onOpenChange(false);
      setTitle("");
      setAmount("");
      setNote("");
      setReceiptUrl("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Maid salary, Wifi bill" />
          </div>
          <div>
            <Label className="mb-1">Category</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1">Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ONE_TIME">One-time</SelectItem>
                <SelectItem value="MONTHLY">Monthly recurring</SelectItem>
                <SelectItem value="YEARLY">Yearly recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1">Receipt / photo (optional)</Label>
            <PhotoUpload value={receiptUrl} onChange={setReceiptUrl} label="Add receipt" />
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
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
