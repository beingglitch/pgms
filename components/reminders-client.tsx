"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Search, Send } from "lucide-react";
import { SendDuesReminderDialog } from "@/components/send-dues-reminder-dialog";
import { Amount, EmptyState, KhataRow, PageTitle, Panel, SectionHeading, StatTile } from "@/components/khata";
import { getReminderHistory } from "@/app/actions/reminders";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { type Signature } from "@/lib/messages";
import { chargeOutstanding, CHARGE_TYPE_LABELS } from "@/lib/charges";
import { inr, fmtDate, initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DueRow = Awaited<ReturnType<typeof listOutstandingByTenant>>[number];
type History = Awaited<ReturnType<typeof getReminderHistory>>;

export function RemindersClient({
  dues,
  history,
  paymentLink,
  signature,
}: {
  dues: DueRow[];
  history: History;
  paymentLink: string;
  signature: Signature;
}) {
  const router = useRouter();
  const [customFor, setCustomFor] = useState<DueRow | null>(null);
  const [chaseQuery, setChaseQuery] = useState("");
  const [sentQuery, setSentQuery] = useState("");

  const totalToChase = dues.reduce((s, d) => s + d.summary.total.outstanding, 0);

  const chaseQ = chaseQuery.trim().toLowerCase();
  const filteredDues = chaseQ
    ? dues.filter((row) => {
        const roomLabel = row.tenant.room ? `Room ${row.tenant.room.number}` : row.tenant.roomNumber || "";
        return row.tenant.name.toLowerCase().includes(chaseQ) || roomLabel.toLowerCase().includes(chaseQ);
      })
    : dues;

  const sentQ = sentQuery.trim().toLowerCase();
  const filteredLogs = sentQ ? history.logs.filter((log) => (log.detail ?? "").toLowerCase().includes(sentQ)) : history.logs;

  return (
    <div className="space-y-4">
      <PageTitle>Reminders</PageTitle>

      <StatTile label="To chase" value={dues.length} tone={dues.length ? "owed" : "positive"} hint={inr(totalToChase)} />

      <Tabs defaultValue="chase">
        <TabsList className="w-full">
          <TabsTrigger value="chase" className="flex-1">
            Dues to chase
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={chaseQuery}
                  onChange={(e) => setChaseQuery(e.target.value)}
                  placeholder="Search by tenant or room"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Each message is itemised and shows only what&apos;s still unpaid. Tap send and it opens in your own
                WhatsApp or mail app, nothing goes out on its own.
              </p>
              {filteredDues.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No one matches that search.</p>
              ) : (
                filteredDues.map((row) => (
                  <ChaseCard
                    key={row.tenant.id}
                    row={row}
                    lastSent={history.lastSentByTenant[row.tenant.id]}
                    onSend={() => setCustomFor(row)}
                  />
                ))
              )}
            </>
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
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={sentQuery}
                    onChange={(e) => setSentQuery(e.target.value)}
                    placeholder="Search by tenant"
                    className="pl-9"
                  />
                </div>
                {filteredLogs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No sent reminders match that search.</p>
                ) : (
                  filteredLogs.map((log) => (
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
              </>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              &ldquo;Sent&rdquo; means the message was handed to WhatsApp or your mail app. This app can&apos;t
              confirm it was delivered or read.
            </p>
          </Panel>
        </TabsContent>
      </Tabs>

      {customFor && (
        <SendDuesReminderDialog
          open={!!customFor}
          onOpenChange={(o) => {
            if (!o) {
              setCustomFor(null);
              router.refresh();
            }
          }}
          tenantId={customFor.tenant.id}
          tenantName={customFor.tenant.name}
          roomLabel={customFor.tenant.room ? `Room ${customFor.tenant.room.number}` : customFor.tenant.roomNumber}
          roomId={customFor.tenant.room?.id}
          phone={customFor.tenant.phone}
          email={customFor.tenant.email}
          signature={signature}
          paymentLink={paymentLink}
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
