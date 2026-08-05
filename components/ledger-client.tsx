"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, MessageCircle, Plus, Receipt, Search, Sparkles, X } from "lucide-react";
import { LedgerFormDialog } from "@/components/ledger-form-dialog";
import { ChargeFormDialog } from "@/components/charge-form-dialog";
import { ReceiptDialog } from "@/components/receipt-dialog";
import { SendDuesReminderDialog } from "@/components/send-dues-reminder-dialog";
import { Amount, EmptyState, KhataRow, PageTitle, Panel, StatTile } from "@/components/khata";
import { deleteLedgerEntry, listLedger } from "@/app/actions/ledger";
import { generateRentCharges, listOutstandingByTenant, waiveCharge } from "@/app/actions/charges";
import { chargeOutstanding, chargePaid, CHARGE_TYPE_LABELS, num } from "@/lib/charges";
import { type Signature } from "@/lib/messages";
import { useManager } from "@/lib/manager-context";
import { inr, fmtDate, monthKey, initials, todayISO } from "@/lib/format";
import { toast } from "sonner";

type Entry = Awaited<ReturnType<typeof listLedger>>[number];
type DueRow = Awaited<ReturnType<typeof listOutstandingByTenant>>[number];
type TenantOption = { id: string; name: string; roomNumber: string | null; rentAmount: unknown; phone: string; email: string | null };

export function LedgerClient({
  entries,
  dues,
  tenants,
  initialTab,
  signature,
  paymentLink,
}: {
  entries: Entry[];
  dues: DueRow[];
  tenants: TenantOption[];
  initialTab: "payments" | "dues";
  signature: Signature;
  paymentLink: string;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [tab, setTab] = useState(initialTab);
  const [payOpen, setPayOpen] = useState(false);
  const [chargeFor, setChargeFor] = useState<DueRow | null>(null);
  const [receipt, setReceipt] = useState<Entry | null>(null);
  const [remindTarget, setRemindTarget] = useState<DueRow | null>(null);
  const [busy, setBusy] = useState(false);

  const totalOutstanding = dues.reduce((s, d) => s + d.summary.total.outstanding, 0);
  const overdueTotal = dues.reduce((s, d) => s + d.summary.overdue, 0);

  async function raiseRent() {
    setBusy(true);
    const result = await generateRentCharges(manager);
    setBusy(false);
    toast.success(
      result.created > 0
        ? `Rent raised for ${result.created} tenant${result.created === 1 ? "" : "s"}`
        : "Everyone already has this month's rent"
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <PageTitle
        action={
          <Button size="sm" onClick={() => setPayOpen(true)}>
            <Plus className="h-4 w-4" /> Record payment
          </Button>
        }
      >
        Ledger
      </PageTitle>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "payments" | "dues")}>
        <TabsList className="w-full">
          <TabsTrigger value="payments" className="flex-1">
            Payments
          </TabsTrigger>
          <TabsTrigger value="dues" className="flex-1">
            Dues
            {dues.length > 0 && (
              <span className="ml-1.5 rounded-full bg-ledger px-1.5 py-0.5 text-[10px] font-bold text-ledger-foreground">
                {dues.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-4">
          <PaymentsTab entries={entries} onReceipt={setReceipt} manager={manager} onChanged={() => router.refresh()} />
        </TabsContent>

        <TabsContent value="dues" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total pending" value={inr(totalOutstanding)} tone={totalOutstanding > 0 ? "owed" : "positive"} />
            <StatTile
              label="Of that, overdue"
              value={inr(overdueTotal)}
              tone={overdueTotal > 0 ? "owed" : "muted"}
              hint={`${dues.length} tenant${dues.length === 1 ? "" : "s"} with a balance`}
            />
          </div>

          <Panel className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Raise this month&apos;s rent</p>
              <p className="text-xs text-muted-foreground">
                Bills every active tenant using their room split. Running it twice won&apos;t double-charge anyone.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={raiseRent} disabled={busy}>
              <Sparkles className="h-4 w-4" /> Raise rent
            </Button>
          </Panel>

          {dues.length === 0 ? (
            <EmptyState icon={Sparkles} title="Nobody owes anything">
              Every charge raised so far has been paid in full.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {dues.map((row) => (
                <DueCard
                  key={row.tenant.id}
                  row={row}
                  manager={manager}
                  onAddCharge={() => setChargeFor(row)}
                  onRemind={() => setRemindTarget(row)}
                  onChanged={() => router.refresh()}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <LedgerFormDialog open={payOpen} onOpenChange={setPayOpen} tenants={tenants as never} />
      {chargeFor && (
        <ChargeFormDialog
          open={!!chargeFor}
          onOpenChange={(o) => !o && setChargeFor(null)}
          tenantId={chargeFor.tenant.id}
          tenantName={chargeFor.tenant.name}
        />
      )}
      {receipt && <ReceiptDialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} entryId={receipt.id} signature={signature} paymentLink={paymentLink} />}
      {remindTarget && (
        <SendDuesReminderDialog
          open={!!remindTarget}
          onOpenChange={(o) => {
            if (!o) {
              setRemindTarget(null);
              router.refresh();
            }
          }}
          tenantId={remindTarget.tenant.id}
          tenantName={remindTarget.tenant.name}
          roomLabel={remindTarget.tenant.room ? `Room ${remindTarget.tenant.room.number}` : remindTarget.tenant.roomNumber}
          phone={remindTarget.tenant.phone}
          email={remindTarget.tenant.email}
          signature={signature}
          paymentLink={paymentLink}
        />
      )}
    </div>
  );
}

function PaymentsTab({
  entries,
  onReceipt,
  manager,
  onChanged,
}: {
  entries: Entry[];
  onReceipt: (e: Entry) => void;
  manager: string;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const months = useMemo(
    () => Array.from(new Set(entries.map((e) => monthKey(e.date)))).sort().reverse(),
    [entries]
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (month !== "all" && monthKey(e.date) !== month) return false;
      const day = new Date(e.date).toISOString().slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      return (
        (e.tenant?.name ?? "").toLowerCase().includes(q) ||
        (e.receiptNo ?? "").toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
      );
    });
  }, [entries, query, month, from, to]);

  // Deposits are held, not earned, so they're totalled separately.
  const collected = list.filter((e) => e.type === "RENT" || e.type === "OTHER").reduce((s, e) => s + num(e.amount), 0);
  const deposits = list.filter((e) => e.type === "DEPOSIT").reduce((s, e) => s + num(e.amount), 0);
  const refunds = list.filter((e) => e.type === "REFUND").reduce((s, e) => s + num(e.amount), 0);
  const filtered = query || month !== "all" || from || to;

  async function remove(id: string) {
    await deleteLedgerEntry(manager, id);
    toast.success("Entry deleted");
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by tenant, receipt no, or note"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto flex-1 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto flex-1 text-xs" />
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setMonth("all");
                setFrom("");
                setTo("");
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", ...months].map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                month === m ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "all" ? "All time" : m}
            </button>
          ))}
        </div>
      </div>

      <Panel className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Collected in view</p>
          <Amount value={collected} tone="positive" size="lg" />
        </div>
        {deposits > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Deposits taken</p>
            <Amount value={deposits} tone="held" size="lg" />
          </div>
        )}
        {refunds > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Refunded</p>
            <Amount value={refunds} tone="muted" size="lg" />
          </div>
        )}
      </Panel>

      {list.length === 0 ? (
        <EmptyState icon={BookOpen} title={filtered ? "No payments match" : "No payments yet"}>
          {filtered ? "Try a wider date range or clear the filters." : "Record your first payment and it will appear here with a receipt number."}
        </EmptyState>
      ) : (
        <Panel className="py-0">
          {list.map((e) => (
            <KhataRow
              key={e.id}
              amount={
                <div className="text-right">
                  <Amount value={e.amount} tone={e.type === "REFUND" ? "owed" : e.type === "DEPOSIT" ? "held" : "positive"} />
                  <div className="mt-0.5 flex items-center justify-end gap-2">
                    <button onClick={() => onReceipt(e)} className="text-[11px] font-semibold text-primary">
                      Receipt
                    </button>
                    <button onClick={() => remove(e.id)} className="text-[11px] font-semibold text-destructive">
                      Delete
                    </button>
                  </div>
                </div>
              }
            >
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={e.tenant?.photoUrl ?? undefined} />
                  <AvatarFallback className="text-[10px]">{initials(e.tenant?.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {e.tenant?.name || "Unknown tenant"}
                    <Badge variant="outline" className="ml-1.5 capitalize">
                      {e.type.toLowerCase()}
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fmtDate(e.date)} · {e.mode.replace("_", " ").toLowerCase()}
                    {e.receiptNo ? <span className="serial"> · {e.receiptNo}</span> : null}
                  </p>
                  {e.allocations.length > 0 && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      → {e.allocations.map((a) => a.charge.description).join(", ")}
                    </p>
                  )}
                  {e.note && <p className="truncate text-[11px] text-muted-foreground">{e.note}</p>}
                </div>
              </div>
            </KhataRow>
          ))}
        </Panel>
      )}
    </div>
  );
}

function DueCard({
  row,
  manager,
  onAddCharge,
  onRemind,
  onChanged,
}: {
  row: DueRow;
  manager: string;
  onAddCharge: () => void;
  onRemind: () => void;
  onChanged: () => void;
}) {
  const { tenant, summary } = row;
  const today = todayISO();
  const open = tenant.charges.filter((c) => chargeOutstanding(c) > 0.005);

  const roomLabel = tenant.room ? `${tenant.room.floor.name} · Room ${tenant.room.number}` : tenant.roomNumber;

  async function toggleWaive(id: string, waived: boolean) {
    await waiveCharge(manager, id, waived);
    toast.success(waived ? "Charge waived" : "Waiver removed");
    onChanged();
  }

  return (
    <Panel>
      <div className="mb-3 flex items-start justify-between gap-3">
        <Link href={`/tenants/${tenant.id}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-9 w-9">
            <AvatarImage src={tenant.photoUrl ?? undefined} />
            <AvatarFallback className="text-[10px]">{initials(tenant.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold tracking-tight">{tenant.name}</p>
            {roomLabel && <p className="truncate text-xs text-muted-foreground">{roomLabel}</p>}
          </div>
        </Link>
        <div className="text-right">
          <Amount value={summary.total.outstanding} tone="owed" size="lg" />
          {summary.overdue > 0 && (
            <p className="text-[11px] font-semibold text-ledger">{inr(summary.overdue)} overdue</p>
          )}
        </div>
      </div>

      <div className="border-t border-border/70">
        {open.map((charge) => {
          const outstanding = chargeOutstanding(charge);
          const paid = chargePaid(charge);
          const late = new Date(charge.dueDate).toISOString().slice(0, 10) < today;

          return (
            <KhataRow
              key={charge.id}
              className="py-2.5"
              amount={
                <div className="text-right">
                  <Amount value={outstanding} tone="owed" size="sm" />
                  {paid > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {inr(paid)} of {inr(num(charge.amount))} paid
                    </p>
                  )}
                </div>
              }
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {CHARGE_TYPE_LABELS[charge.type]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm">{charge.description}</p>
                  <p className={`text-[11px] ${late ? "font-semibold text-ledger" : "text-muted-foreground"}`}>
                    {late ? "Overdue since" : "Due"} {fmtDate(charge.dueDate)}
                    {paid > 0 && <span className="ml-1 text-muted-foreground">· part paid</span>}
                  </p>
                </div>
              </div>
            </KhataRow>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3">
        <Button size="sm" variant="secondary" onClick={onRemind}>
          <MessageCircle className="h-3.5 w-3.5" /> Send reminder
        </Button>
        <Button size="sm" variant="outline" onClick={onAddCharge}>
          <Plus className="h-3.5 w-3.5" /> Add charge
        </Button>
        <Button size="sm" variant="ghost" render={<Link href={`/tenants/${tenant.id}`} />}>
          <Receipt className="h-3.5 w-3.5" /> Open tenant
        </Button>
        {open.length > 0 && (
          <button
            onClick={() => toggleWaive(open[open.length - 1].id, true)}
            className="ml-auto self-center text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Waive last charge
          </button>
        )}
      </div>
    </Panel>
  );
}
