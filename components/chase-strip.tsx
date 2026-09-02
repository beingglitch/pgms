"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IndianRupee } from "lucide-react";
import { Amount } from "@/components/khata";
import { SendDuesReminderDialog } from "@/components/send-dues-reminder-dialog";
import { LedgerFormDialog } from "@/components/ledger-form-dialog";
import { type Signature } from "@/lib/messages";
import { inr } from "@/lib/format";
import type { TenantModel } from "@/lib/generated/prisma/models";

export type ChaseRow = {
  tenant: Pick<TenantModel, "id" | "name" | "phone" | "email" | "roomNumber"> & {
    rentAmount: number;
    room: { id: string; number: string } | null;
  };
  outstanding: number;
  daysLate: number;
};

/**
 * Who to chase today, oldest-late first. A dedicated dialog steps the owner
 * through every overdue tenant one at a time for "Remind all" - WhatsApp
 * deep-links only ever address one recipient, and browsers block firing off
 * several `wa.me` tabs from one click, so there is no real one-tap bulk send.
 */
export function ChaseStrip({
  rows,
  tenants,
  signature,
  paymentLink,
}: {
  rows: ChaseRow[];
  tenants: (Pick<TenantModel, "id" | "name" | "roomNumber"> & { rentAmount: number })[];
  signature: Signature;
  paymentLink: string;
}) {
  const router = useRouter();
  const [reminderFor, setReminderFor] = useState<ChaseRow | null>(null);
  const [reminderFromAll, setReminderFromAll] = useState(false);
  const [payFor, setPayFor] = useState<ChaseRow | null>(null);
  const [remindAllOpen, setRemindAllOpen] = useState(false);

  function pickFromAll(row: ChaseRow) {
    setRemindAllOpen(false);
    setReminderFromAll(true);
    setReminderFor(row);
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Chase today{rows.length > 0 ? ` · ${rows.length}` : ""}
        </h2>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => setRemindAllOpen(true)}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            Remind all
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          Nobody owes anything today.
        </p>
      ) : (
        <div className="-mx-4 flex min-w-0 gap-2.5 overflow-x-auto px-4 pb-1">
          {rows.map((row) => {
            const roomLabel = row.tenant.room ? `Room ${row.tenant.room.number}` : row.tenant.roomNumber || "No room";
            return (
              <div
                key={row.tenant.id}
                className="flex w-[156px] shrink-0 flex-col gap-2 rounded-2xl border border-border border-l-[3px] border-l-ledger bg-background p-[11px_12px] shadow-card"
              >
                <Link href={`/tenants/${row.tenant.id}`} className="min-w-0">
                  <p className="truncate text-[13px] font-bold">{row.tenant.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {roomLabel} · {row.daysLate} day{row.daysLate === 1 ? "" : "s"} late
                  </p>
                </Link>
                <Amount value={row.outstanding} tone="owed" className="text-[19px] font-bold leading-none" />
                <div className="flex gap-1.5">
                  <Button size="xs" className="flex-1 rounded-[9px]" onClick={() => setReminderFor(row)}>
                    Remind
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="shrink-0 rounded-[9px]"
                    onClick={() => setPayFor(row)}
                    title="Record payment"
                  >
                    <IndianRupee className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {remindAllOpen && (
        <Dialog open onOpenChange={(o) => !o && setRemindAllOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remind all · {rows.length}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              WhatsApp only opens one chat at a time. Tap a name to send theirs, oldest late first.
            </p>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {rows.map((row) => (
                <button
                  key={row.tenant.id}
                  onClick={() => pickFromAll(row)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{row.tenant.name}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{row.daysLate}d late</span>
                  </span>
                  <span className="tabular shrink-0 pl-2 font-semibold text-ledger">{inr(row.outstanding)}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {reminderFor && (
        <SendDuesReminderDialog
          open={!!reminderFor}
          onOpenChange={(o) => {
            if (!o) {
              setReminderFor(null);
              router.refresh();
              if (reminderFromAll) {
                setReminderFromAll(false);
                setRemindAllOpen(true);
              }
            }
          }}
          tenantId={reminderFor.tenant.id}
          tenantName={reminderFor.tenant.name}
          roomLabel={reminderFor.tenant.room ? `Room ${reminderFor.tenant.room.number}` : reminderFor.tenant.roomNumber}
          roomId={reminderFor.tenant.room?.id}
          phone={reminderFor.tenant.phone}
          email={reminderFor.tenant.email}
          signature={signature}
          paymentLink={paymentLink}
        />
      )}

      {payFor && (
        <LedgerFormDialog
          open={!!payFor}
          onOpenChange={(o) => {
            if (!o) {
              setPayFor(null);
              router.refresh();
            }
          }}
          tenants={tenants}
          fixedTenantId={payFor.tenant.id}
          outstandingAmount={payFor.outstanding}
        />
      )}
    </section>
  );
}
