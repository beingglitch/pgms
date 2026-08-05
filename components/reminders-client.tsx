"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BellRing, CheckCircle2, MessageCircle, Plus, Send } from "lucide-react";
import { ReminderFormDialog } from "@/components/reminder-form-dialog";
import { SendMessageDialog } from "@/components/send-message-dialog";
import { Amount, EmptyState, KhataRow, PageTitle, Panel, SectionHeading, StatTile } from "@/components/khata";
import { markReminder, deleteReminder, recordReminderSent, getReminderHistory } from "@/app/actions/reminders";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { buildDuesMessage, type Signature } from "@/lib/messages";
import { chargeOutstanding, CHARGE_TYPE_LABELS } from "@/lib/charges";
import { useManager } from "@/lib/manager-context";
import { inr, fmtDate, todayISO, dateISO, initials } from "@/lib/format";
import type { ReminderModel, TenantModel } from "@/lib/generated/prisma/models";
import { toast } from "sonner";

type ReminderWithTenant = ReminderModel & {
  tenant: Pick<TenantModel, "name" | "photoUrl" | "phone" | "email"> | null;
};
type DueRow = Awaited<ReturnType<typeof listOutstandingByTenant>>[number];
type History = Awaited<ReturnType<typeof getReminderHistory>>;

export function RemindersClient({
  reminders,
  dues,
  history,
  tenants,
  paymentLink,
  signature,
}: {
  reminders: ReminderWithTenant[];
  dues: DueRow[];
  history: History;
  tenants: Pick<TenantModel, "id" | "name" | "roomNumber">[];
  paymentLink: string;
  signature: Signature;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [formOpen, setFormOpen] = useState(false);
  const [customFor, setCustomFor] = useState<DueRow | null>(null);
  const [shareTarget, setShareTarget] = useState<ReminderWithTenant | null>(null);

  const totalToChase = dues.reduce((s, d) => s + d.summary.total.outstanding, 0);
  const pending = reminders.filter((r) => r.status === "PENDING");

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> New note
          </Button>
        }
      >
        Reminders
      </PageTitle>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="To chase" value={dues.length} tone={dues.length ? "owed" : "positive"} hint={inr(totalToChase)} />
        <StatTile label="Your notes" value={pending.length} hint="Things you asked to be reminded of" />
      </div>

      <Tabs defaultValue="chase">
        <TabsList className="w-full">
          <TabsTrigger value="chase" className="flex-1">
            Dues to chase
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-1">
            Your notes
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-1">
            Sent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chase" className="mt-4 space-y-3">
          {dues.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nobody to chase">
              Everyone has paid up. This list fills itself from outstanding charges.
            </EmptyState>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Each message is itemised and shows only what&apos;s still unpaid. Tap send and it opens in your own
                WhatsApp or mail app — nothing goes out on its own.
              </p>
              {dues.map((row) => (
                <ChaseCard
                  key={row.tenant.id}
                  row={row}
                  lastSent={history.lastSentByTenant[row.tenant.id]}
                  onSend={() => setCustomFor(row)}
                />
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-2">
          {reminders.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="No notes yet"
              action={
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" /> Add a note
                </Button>
              }
            >
              Use these for anything that isn&apos;t a due — a promised repair, a document to collect.
            </EmptyState>
          ) : (
            reminders.map((r) => {
              const late = r.status === "PENDING" && dateISO(r.dueDate) < todayISO();
              return (
                <Panel key={r.id} className={late ? "border-ledger/50" : ""}>
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={r.tenant?.photoUrl ?? undefined} />
                      <AvatarFallback className="text-[10px]">{initials(r.tenant?.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {r.title}
                        {r.tenant?.name ? ` — ${r.tenant.name}` : ""}
                        <Badge variant="outline" className="ml-1.5 capitalize">
                          {r.type.toLowerCase()}
                        </Badge>
                      </p>
                      <p className={`text-xs ${late ? "font-semibold text-ledger" : "text-muted-foreground"}`}>
                        {r.status === "DONE" ? "Done" : late ? "Overdue since" : "Due"} {fmtDate(r.dueDate)}
                        {r.amount ? ` · ${inr(r.amount)}` : ""}
                      </p>
                      {r.note && <p className="mt-0.5 text-xs text-muted-foreground">{r.note}</p>}
                      <div className="mt-2 flex flex-wrap gap-3">
                        <button
                          onClick={() => setShareTarget(r)}
                          className="flex items-center gap-1 text-xs font-semibold text-primary"
                        >
                          <MessageCircle className="h-3 w-3" /> Send
                        </button>
                        {r.status === "PENDING" && (
                          <button
                            onClick={async () => {
                              await markReminder(manager, r.id, "DONE");
                              router.refresh();
                            }}
                            className="text-xs font-semibold text-positive"
                          >
                            Mark done
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await deleteReminder(r.id);
                            router.refresh();
                          }}
                          className="text-xs font-semibold text-destructive"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </Panel>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          <Panel>
            <SectionHeading>Reminders you&apos;ve sent</SectionHeading>
            {history.logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing sent yet. Sending from the &ldquo;Dues to chase&rdquo; tab records it here.
              </p>
            ) : (
              history.logs.map((log) => (
                <div key={log.id} className="khata-row py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{log.detail?.split(" · ")[0]}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {log.detail?.split(" · ")[1]} via {log.detail?.split(" · ")[2]} ·{" "}
                      {new Date(log.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              &ldquo;Sent&rdquo; means the message was handed to WhatsApp or your mail app. This app can&apos;t
              confirm it was delivered or read.
            </p>
          </Panel>
        </TabsContent>
      </Tabs>

      <ReminderFormDialog open={formOpen} onOpenChange={setFormOpen} tenants={tenants} />

      {customFor && (
        <SendMessageDialog
          open={!!customFor}
          onOpenChange={(o) => !o && setCustomFor(null)}
          title={`Remind ${customFor.tenant.name}`}
          subject={`Pending amount — ${signature.pgName}`}
          message={buildDuesMessage(
            {
              name: customFor.tenant.name,
              roomLabel: customFor.tenant.room ? `Room ${customFor.tenant.room.number}` : customFor.tenant.roomNumber,
            },
            customFor.tenant.charges,
            signature
          )}
          phone={customFor.tenant.phone}
          email={customFor.tenant.email}
          defaultLink={paymentLink}
          onSent={async (channel) => {
            await recordReminderSent(manager, {
              tenantId: customFor.tenant.id,
              tenantName: customFor.tenant.name,
              channel,
              amount: customFor.summary.total.outstanding,
            });
            toast.success("Reminder recorded as sent");
            router.refresh();
          }}
        />
      )}

      {shareTarget && (
        <SendMessageDialog
          open={!!shareTarget}
          onOpenChange={(o) => !o && setShareTarget(null)}
          title="Send reminder"
          subject={shareTarget.title}
          message={`Hi ${shareTarget.tenant?.name ?? ""}, a quick reminder about ${shareTarget.title}${
            shareTarget.amount ? ` (${inr(shareTarget.amount)})` : ""
          }, due ${fmtDate(shareTarget.dueDate)}.\n\n— ${signature.ownerName}, ${signature.pgName}`}
          phone={shareTarget.tenant?.phone}
          email={shareTarget.tenant?.email}
          defaultLink={paymentLink}
        />
      )}
    </div>
  );
}

function ChaseCard({ row, lastSent, onSend }: { row: DueRow; lastSent?: Date; onSend: () => void }) {
  const { tenant, summary } = row;
  const open = tenant.charges.filter((c) => chargeOutstanding(c) > 0.005);
  const roomLabel = tenant.room ? `Room ${tenant.room.number}` : tenant.roomNumber;

  return (
    <Panel>
      <div className="mb-2 flex items-start justify-between gap-3">
        <Link href={`/tenants/${tenant.id}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-9 w-9">
            <AvatarImage src={tenant.photoUrl ?? undefined} />
            <AvatarFallback className="text-[10px]">{initials(tenant.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold tracking-tight">{tenant.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {roomLabel || "No room"}
              {lastSent ? ` · last reminded ${fmtDate(lastSent)}` : " · not reminded yet"}
            </p>
          </div>
        </Link>
        <div className="text-right">
          <Amount value={summary.total.outstanding} tone="owed" size="lg" />
          {summary.overdue > 0 && <p className="text-[11px] font-semibold text-ledger">{inr(summary.overdue)} overdue</p>}
        </div>
      </div>

      {/* The exact breakdown that goes into the message. */}
      <div className="border-t border-border/70">
        {open.map((charge) => (
          <KhataRow
            key={charge.id}
            className="py-1.5"
            amount={<Amount value={chargeOutstanding(charge)} tone="owed" size="sm" />}
          >
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{CHARGE_TYPE_LABELS[charge.type]}</span> ·{" "}
              {charge.description}
            </p>
          </KhataRow>
        ))}
      </div>

      <Button size="sm" className="mt-3 w-full" onClick={onSend}>
        <Send className="h-3.5 w-3.5" /> Review &amp; send reminder
      </Button>
    </Panel>
  );
}
