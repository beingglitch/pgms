"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Mail, Copy } from "lucide-react";
import { getLedgerEntry } from "@/app/actions/ledger";
import { getTenantDues } from "@/app/actions/charges";
import { buildReceiptMessage, type Signature } from "@/lib/messages";
import { waLink, mailtoLink } from "@/lib/messaging";
import { Amount, KhataRow } from "@/components/khata";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";

type Entry = NonNullable<Awaited<ReturnType<typeof getLedgerEntry>>>;

/**
 * A receipt for one payment: what was received, what it settled, and what is
 * still open — then the same thing as text the owner can send.
 */
export function ReceiptDialog({
  open,
  onOpenChange,
  entryId,
  signature,
  paymentLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string;
  signature: Signature;
  paymentLink?: string;
}) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [outstanding, setOutstanding] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const found = await getLedgerEntry(entryId);
      if (!active || !found) return;
      setEntry(found);
      const dues = await getTenantDues(found.tenantId);
      if (active) setOutstanding(dues.summary.total.outstanding);
    })();
    return () => {
      active = false;
    };
  }, [open, entryId]);

  if (!entry) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        </DialogContent>
      </Dialog>
    );
  }

  const roomLabel = entry.tenant.roomNumber ? `Room ${entry.tenant.roomNumber}` : null;
  const message = buildReceiptMessage(
    {
      receiptNo: entry.receiptNo,
      tenantName: entry.tenant.name,
      roomLabel,
      amount: Number(entry.amount),
      date: entry.date,
      mode: entry.mode,
      appliedTo: entry.allocations.map((a) => ({ description: a.charge.description, amount: Number(a.amount) })),
      outstandingAfter: outstanding,
    },
    signature
  );

  // A receipt for a settled account needs no payment link; one with a balance does.
  const fullMessage =
    paymentLink && outstanding > 0.005 ? `${message}\n\nPay the balance: ${paymentLink}` : message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment receipt</DialogTitle>
        </DialogHeader>

        <div className="rounded-2xl border border-border bg-muted/25 p-4">
          <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
            <div>
              <p className="font-display text-base font-semibold tracking-tight">{signature.pgName}</p>
              {signature.address && <p className="text-xs text-muted-foreground">{signature.address}</p>}
            </div>
            {entry.receiptNo && <span className="serial">{entry.receiptNo}</span>}
          </div>

          <div className="space-y-1 py-3 text-sm">
            <p className="font-semibold">{entry.tenant.name}</p>
            <p className="text-xs text-muted-foreground">
              {roomLabel ? `${roomLabel} · ` : ""}
              {fmtDate(entry.date)} · paid by {entry.mode.replace("_", " ").toLowerCase()}
            </p>
          </div>

          <div className="flex items-center justify-between border-y border-border/70 py-3">
            <span className="text-sm font-semibold">Amount received</span>
            <Amount value={entry.amount} tone="positive" size="lg" />
          </div>

          {entry.allocations.length > 0 && (
            <div className="pt-1">
              <p className="pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Adjusted against
              </p>
              {entry.allocations.map((a) => (
                <KhataRow key={a.id} className="py-2" amount={<Amount value={a.amount} size="sm" />}>
                  <p className="truncate text-sm">{a.charge.description}</p>
                </KhataRow>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-3">
            <span className="text-sm font-semibold">
              {outstanding > 0.005 ? "Still pending" : "Account settled"}
            </span>
            <Amount value={outstanding} tone={outstanding > 0.005 ? "owed" : "positive"} />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            — {signature.ownerName}, {signature.pgName}
            {signature.contact ? ` · ${signature.contact}` : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {entry.tenant.phone ? (
            <a href={waLink(entry.tenant.phone, fullMessage)} target="_blank" rel="noreferrer">
              <Button className="w-full">
                <MessageCircle className="h-4 w-4" /> Send on WhatsApp
              </Button>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No phone number on file for WhatsApp.</p>
          )}
          {entry.tenant.email ? (
            <a href={mailtoLink(entry.tenant.email, `Receipt ${entry.receiptNo ?? ""} — ${signature.pgName}`, fullMessage)}>
              <Button variant="outline" className="w-full">
                <Mail className="h-4 w-4" /> Send by email
              </Button>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No email on file — add one on the tenant&apos;s profile.</p>
          )}
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              navigator.clipboard?.writeText(fullMessage);
              toast.success("Receipt copied");
            }}
          >
            <Copy className="h-4 w-4" /> Copy receipt text
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
