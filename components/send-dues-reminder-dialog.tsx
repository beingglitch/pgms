"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Mail, Copy, Pencil, Plus, RotateCcw, Trash2, Zap } from "lucide-react";
import { getTenantDues, addManualCharge, adjustChargeAmount, deleteCharge } from "@/app/actions/charges";
import { recordElectricityCharge } from "@/app/actions/electricity";
import { useElectricityFields, ElectricityReadingFields } from "@/components/electricity-fields";
import { recordReminderSent } from "@/app/actions/reminders";
import { buildDuesMessage, type Signature } from "@/lib/messages";
import { waLink, mailtoLink } from "@/lib/messaging";
import { Amount, KhataRow } from "@/components/khata";
import { CHARGE_TYPE_LABELS, chargeOutstanding, chargePaid, round2 } from "@/lib/charges";
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
  roomId,
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
  /** When set, offers closing out the room's in-progress meter reading right here. */
  roomId?: string | null;
  phone?: string | null;
  email?: string | null;
  signature: Signature;
  paymentLink?: string;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [dues, setDues] = useState<TenantDues | null>(null);
  const [extraDescription, setExtraDescription] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [addingExtra, setAddingExtra] = useState(false);
  const [closingReading, setClosingReading] = useState(false);
  // null means "keep following whatever's auto-generated"; once the owner
  // types into the message box directly, their edit wins from then on, even
  // as a charge gets added underneath it.
  const [messageOverride, setMessageOverride] = useState<string | null>(null);
  // Charge id -> amount, for a row edited here without touching the real
  // charge yet: it only reshapes this message until "Save to ledger" makes
  // it real (or the dialog closes and the edit is forgotten).
  const [amountOverrides, setAmountOverrides] = useState<Record<string, number>>({});
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const elec = useElectricityFields(roomId, open, todayISO());

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
      setMessageOverride(null);
      setAmountOverrides({});
      setEditingRow(null);
    }
  }

  async function refresh() {
    setDues(await getTenantDues(tenantId));
    // Charges added here show up in the Ledger and on the tenant's own page
    // too - revalidatePath inside the actions marks those routes stale, but
    // this tells the router to actually pick that up right away rather than
    // waiting for the next navigation to notice.
    router.refresh();
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

  async function closeReading() {
    if (!elec.room || !elec.estimate) return toast.error("Enter valid readings.");
    if (!elec.endPhotoUrl) return toast.error("Add a photo of the meter as proof of this reading.");
    if (!elec.room.openReading && !elec.startPhotoUrl) {
      return toast.error("Add a photo of the meter as proof of the starting reading.");
    }

    setClosingReading(true);
    const result = await recordElectricityCharge(manager, {
      roomId: roomId!,
      startReading: Number(elec.startReading),
      endReading: Number(elec.endReading),
      endPhotoUrl: elec.endPhotoUrl,
      startPhotoUrl: elec.room.openReading ? undefined : elec.startPhotoUrl,
      startDate: elec.room.openReading ? undefined : elec.startDateInput,
      rateOverride: elec.rateOverride !== "" ? Number(elec.rateOverride) : undefined,
      dueDate: todayISO(),
    });
    setClosingReading(false);

    if (!result) return toast.error("Couldn't close that reading.");

    await refresh();
    toast.success(`Electricity charge added: ${result.units} units`);
  }

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

  /** A row edited here without "Save to ledger" yet - reshapes this message and the total shown, nothing else. */
  function clearOverride(chargeId: string) {
    setAmountOverrides((o) => {
      const next = { ...o };
      delete next[chargeId];
      return next;
    });
  }

  async function saveOverrideToLedger(chargeId: string) {
    const amount = amountOverrides[chargeId];
    if (amount === undefined) return;
    try {
      await adjustChargeAmount(manager, chargeId, amount);
      clearOverride(chargeId);
      await refresh();
      toast.success("Charge updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update that charge.");
    }
  }

  async function removeCharge(chargeId: string) {
    await deleteCharge(manager, chargeId);
    clearOverride(chargeId);
    await refresh();
    toast.success("Charge removed");
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

  // A row edited here (but not yet saved to the ledger) reshapes the total
  // and the message the same way a real change would, without touching the
  // actual charge until "Save to ledger" is clicked.
  const displayedOpen = dues.open.map((c) => (amountOverrides[c.id] !== undefined ? { ...c, amount: amountOverrides[c.id] } : c));
  const displayedTotal = round2(displayedOpen.reduce((s, c) => s + chargeOutstanding(c), 0));

  const message = buildDuesMessage({ name: tenantName, roomLabel }, displayedOpen, signature);
  const autoMessage = paymentLink ? `${message}\n\npay here: ${paymentLink}` : message;
  // What actually goes out: the owner's own edit if they've made one, the
  // freshly-generated text otherwise - and every send/copy action below
  // reads this one value, so an edit here is what gets used everywhere.
  const fullMessage = messageOverride ?? autoMessage;

  async function markSent(channel: "whatsapp" | "email") {
    await recordReminderSent(manager, {
      tenantId,
      tenantName,
      channel,
      amount: displayedTotal,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send reminder to {tenantName}</DialogTitle>
        </DialogHeader>

        {displayedOpen.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            {displayedOpen.map((c) => {
              const overridden = amountOverrides[c.id] !== undefined;
              const outstanding = chargeOutstanding(c);
              return (
                <KhataRow
                  key={c.id}
                  className="py-1.5"
                  amount={
                    <div className="text-right">
                      {editingRow === c.id ? (
                        <Input
                          type="number"
                          min={0}
                          autoFocus
                          defaultValue={outstanding}
                          className="h-7 w-24 shrink-0 px-2 text-right text-sm"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v) && v >= 0) {
                              setAmountOverrides((o) => ({ ...o, [c.id]: round2(v + chargePaid(c)) }));
                            }
                            setEditingRow(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditingRow(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingRow(c.id)}
                          className="flex items-center gap-1 font-semibold hover:text-primary"
                        >
                          <Amount value={outstanding} tone="owed" size="sm" />
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                      <div className="mt-0.5 flex items-center justify-end gap-2">
                        {overridden && (
                          <button
                            type="button"
                            onClick={() => saveOverrideToLedger(c.id)}
                            className="text-[10px] font-semibold text-primary hover:underline"
                          >
                            Save to ledger
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCharge(c.id)}
                          className="flex items-center gap-0.5 text-[10px] font-semibold text-destructive hover:underline"
                        >
                          <Trash2 className="h-2.5 w-2.5" /> Delete
                        </button>
                      </div>
                    </div>
                  }
                >
                  <p className="break-words text-sm">
                    <span className="text-xs font-semibold text-muted-foreground">{CHARGE_TYPE_LABELS[c.type]}:</span>{" "}
                    {c.description}
                    {overridden && <span className="ml-1 text-[10px] font-semibold text-primary">(edited, not saved)</span>}
                  </p>
                </KhataRow>
              );
            })}
            <div className="flex items-center justify-between border-t border-border/70 pt-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular">{inr(displayedTotal)}</span>
            </div>
          </div>
        )}

        {roomId && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Zap className="h-3.5 w-3.5" /> Bill electricity
            </p>
            <ElectricityReadingFields fields={elec} tenantId={tenantId} />
            {elec.room && (
              <Button
                size="sm"
                variant="secondary"
                onClick={closeReading}
                disabled={
                  closingReading ||
                  !elec.estimate ||
                  !elec.endPhotoUrl ||
                  (!elec.room?.openReading && !elec.startPhotoUrl)
                }
                className="w-full"
              >
                Add charge
              </Button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Add an extra charge before sending
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="e.g. Late fee"
              value={extraDescription}
              onChange={(e) => setExtraDescription(e.target.value)}
              className="min-w-0 flex-1"
            />
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={extraAmount}
                onChange={(e) => setExtraAmount(e.target.value)}
                className="w-24"
              />
              <Button size="icon" variant="secondary" onClick={addExtra} disabled={addingExtra} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Message</p>
            {messageOverride !== null && (
              <button
                type="button"
                onClick={() => setMessageOverride(null)}
                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <RotateCcw className="h-3 w-3" /> Reset to auto-generated
              </button>
            )}
          </div>
          <Textarea
            value={fullMessage}
            onChange={(e) => setMessageOverride(e.target.value)}
            rows={6}
            className="text-sm"
          />
        </div>

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
