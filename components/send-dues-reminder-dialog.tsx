"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Mail, Copy, Plus } from "lucide-react";
import { getTenantDues, addManualCharge } from "@/app/actions/charges";
import { recordReminderSent } from "@/app/actions/reminders";
import { buildDuesMessage, type Signature } from "@/lib/messages";
import { waLink, mailtoLink } from "@/lib/messaging";
import { Amount, KhataRow } from "@/components/khata";
import { CHARGE_TYPE_LABELS, chargeOutstanding } from "@/lib/charges";
import { inr, todayISO } from "@/lib/format";
import { useManager } from "@/lib/manager-context";
import { toast } from "sonner";

type TenantDues = Awaited<ReturnType<typeof getTenantDues>>;

/**
 * The one place a dues reminder gets composed and sent.
 *
 * Opens straight to the current rent and electricity owed. Before sending,
 * the owner can add anything not already billed, e.g. this month's late fee.
 * It becomes a real Charge immediately, not just text, so it stays part of
 * the tenant's record and gets paid down like everything else.
 */
export function SendDuesReminderDialog({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  roomLabel,
  phone,
  email,
  signature,
  paymentLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  roomLabel?: string | null;
  phone?: string | null;
  email?: string | null;
  signature: Signature;
  paymentLink?: string;
}) {
  const { manager } = useManager();
  const [dues, setDues] = useState<TenantDues | null>(null);
  const [extraDescription, setExtraDescription] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [addingExtra, setAddingExtra] = useState(false);

  // Reset the form the moment the dialog opens. Adjusted during render, from
  // a prop change, rather than in an effect, which is reserved below for the
  // actual external fetch.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDues(null);
      setExtraDescription("");
      setExtraAmount("");
    }
  }

  async function refresh() {
    setDues(await getTenantDues(tenantId));
  }

  // The fetch itself lives here, since loading a tenant's dues on open is
  // syncing with the server. `active` guards against a stale response
  // landing after the tenant or open state has already moved on.
  useEffect(() => {
    if (!open) return;
    let active = true;
    getTenantDues(tenantId).then((result) => {
      if (active) setDues(result);
    });
    return () => {
      active = false;
    };
  }, [open, tenantId]);

  async function addExtra() {
    const amount = Number(extraAmount);
    if (!extraDescription.trim()) return toast.error("Say what the extra charge is for.");
    if (!(amount > 0)) return toast.error("Enter an amount above zero.");

    setAddingExtra(true);
    await addManualCharge(manager, {
      tenantId,
      type: "OTHER",
      description: extraDescription.trim(),
      amount,
      dueDate: todayISO(),
    });
    setExtraDescription("");
    setExtraAmount("");
    await refresh();
    setAddingExtra(false);
  }

  if (!dues) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send reminder</DialogTitle>
          </DialogHeader>
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        </DialogContent>
      </Dialog>
    );
  }

  const message = buildDuesMessage({ name: tenantName, roomLabel }, dues.open, signature);
  const fullMessage = paymentLink ? `${message}\n\npay here: ${paymentLink}` : message;

  async function markSent(channel: "whatsapp" | "email") {
    await recordReminderSent(manager, {
      tenantId,
      tenantName,
      channel,
      amount: dues!.summary.total.outstanding,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send reminder to {tenantName}</DialogTitle>
        </DialogHeader>

        {dues.open.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            {dues.open.map((c) => (
              <KhataRow key={c.id} className="py-1.5" amount={<Amount value={chargeOutstanding(c)} tone="owed" size="sm" />}>
                <p className="truncate text-sm">
                  <span className="text-xs font-semibold text-muted-foreground">{CHARGE_TYPE_LABELS[c.type]}:</span>{" "}
                  {c.description}
                </p>
              </KhataRow>
            ))}
            <div className="flex items-center justify-between border-t border-border/70 pt-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular">{inr(dues.summary.total.outstanding)}</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Add an extra charge before sending
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Late fee"
              value={extraDescription}
              onChange={(e) => setExtraDescription(e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Amount"
              value={extraAmount}
              onChange={(e) => setExtraAmount(e.target.value)}
              className="w-24"
            />
            <Button size="icon" variant="secondary" onClick={addExtra} disabled={addingExtra}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">{fullMessage}</div>

        <div className="flex flex-col gap-2 pt-1">
          {phone ? (
            <a href={waLink(phone, fullMessage)} target="_blank" rel="noreferrer" onClick={() => markSent("whatsapp")}>
              <Button className="w-full">
                <MessageCircle className="h-4 w-4" /> Send on WhatsApp
              </Button>
            </a>
          ) : (
            <p className="text-xs text-destructive">No phone number on file for WhatsApp.</p>
          )}
          {email ? (
            <a
              href={mailtoLink(email, `Pending amount: ${signature.pgName}`, fullMessage)}
              onClick={() => markSent("email")}
            >
              <Button variant="outline" className="w-full">
                <Mail className="h-4 w-4" /> Send by email
              </Button>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No email on file.</p>
          )}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              navigator.clipboard?.writeText(fullMessage);
              toast.success("Copied to clipboard");
            }}
          >
            <Copy className="h-4 w-4" /> Copy message
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
