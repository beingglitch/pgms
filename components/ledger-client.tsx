"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ZoomableAvatar } from "@/components/image-viewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, IndianRupee, Plus, Receipt, Search, Sparkles, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LedgerFormDialog } from "@/components/ledger-form-dialog";
import { ChargeFormDialog } from "@/components/charge-form-dialog";
import { ReceiptDialog } from "@/components/receipt-dialog";
import { SendDuesReminderDialog } from "@/components/send-dues-reminder-dialog";
import { Amount, EmptyState, KhataRow, PageTitle, Panel, SectionHeading, StatTile } from "@/components/khata";
import { DuesAgingChart } from "@/components/dues-aging-chart";
import { deleteLedgerEntry, listLedger } from "@/app/actions/ledger";
import { listOutstandingByTenant, waiveCharge } from "@/app/actions/charges";
import { deleteExpense, listExpenses } from "@/app/actions/expenses";
import { listSecurityDeposits } from "@/app/actions/reports";
import { bucketDuesAging, chargeOutstanding, chargePaid, CHARGE_TYPE_LABELS, num, periodLabel } from "@/lib/charges";
import { AdjustChargeDialog } from "@/components/adjust-charge-dialog";
import { type Signature } from "@/lib/messages";
import { useManager } from "@/lib/manager-context";
import { inr, fmtDate, monthKey, todayISO, daysFromNowISO, dateISO, paymentMethodLabel } from "@/lib/format";
import type { Serialised } from "@/lib/serialize";
import { toast } from "sonner";

type Entry = Awaited<ReturnType<typeof listLedger>>[number];
type ExpenseRow = Serialised<Awaited<ReturnType<typeof listExpenses>>[number]>;
type DueRow = Serialised<Awaited<ReturnType<typeof listOutstandingByTenant>>[number]>;
type Deposits = Awaited<ReturnType<typeof listSecurityDeposits>>;
type TenantOption = {
  id: string;
  name: string;
  photoUrl: string | null;
  roomNumber: string | null;
  rentAmount: unknown;
  phone: string;
  email: string | null;
  room: { id: string } | null;
};
type FeedRow = { kind: "payment"; date: Date; data: Entry } | { kind: "expense"; date: Date; data: ExpenseRow };

/** Earliest due date among a tenant's still-open charges, or +Infinity when they have none (sorts last). */
function earliestDueDate(row: DueRow) {
  const openDates = row.tenant.charges.filter((c) => chargeOutstanding(c) > 0.005).map((c) => new Date(c.dueDate).getTime());
  return openDates.length > 0 ? Math.min(...openDates) : Infinity;
}

export function LedgerClient({
  entries,
  expenses,
  deposits,
  dues,
  tenants,
  dueSoonDays,
  initialTab,
  initialDuesFilter,
  initialMonth,
  signature,
  paymentLink,
}: {
  entries: Entry[];
  expenses: ExpenseRow[];
  deposits: Deposits;
  dues: DueRow[];
  tenants: TenantOption[];
  dueSoonDays: number;
  initialTab: "payments" | "dues" | "security";
  initialDuesFilter?: "all" | "upcoming" | "current";
  initialMonth?: string;
  signature: Signature;
  paymentLink: string;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [tab, setTab] = useState(initialTab);
  const [chargeFor, setChargeFor] = useState<DueRow | null>(null);
  const [receipt, setReceipt] = useState<Entry | null>(null);
  const [remindTarget, setRemindTarget] = useState<DueRow | null>(null);
  const [payTarget, setPayTarget] = useState<DueRow | null>(null);
  const [duesFilter, setDuesFilter] = useState<"all" | "upcoming" | "current">(initialDuesFilter ?? "all");
  const [pickingTenant, setPickingTenant] = useState(false);
  const [addDueTenant, setAddDueTenant] = useState<TenantOption | null>(null);
  const [tenantQuery, setTenantQuery] = useState("");

  const totalOutstanding = dues.reduce((s, d) => s + d.summary.total.outstanding, 0);
  const overdueTotal = dues.reduce((s, d) => s + d.summary.overdue, 0);
  const chequeTotal = deposits.tenants
    .filter((t) => t.depositMethod === "CHEQUE")
    .reduce((s, t) => s + num(t.depositAmount), 0);

  // Current: due today or overdue, the day a charge exists at all in the
  // normal case. Upcoming: due later, but inside the window Settings sets,
  // which mostly means a charge someone added ahead of time by hand.
  const today = todayISO();
  const horizon = daysFromNowISO(dueSoonDays);
  const filteredDues = dues.filter((row) => {
    if (duesFilter === "all") return true;
    const openCharges = row.tenant.charges.filter((c) => chargeOutstanding(c) > 0.005);
    if (duesFilter === "current") return openCharges.some((c) => dateISO(c.dueDate) <= today);
    return openCharges.some((c) => {
      const day = dateISO(c.dueDate);
      return day > today && day <= horizon;
    });
  });

  // Oldest overdue charge first, so the person who's owed the longest sorts
  // to the top - the tenant a chase list should surface first.
  const sortedDues = [...filteredDues].sort((a, b) => earliestDueDate(a) - earliestDueDate(b));

  const agingBuckets = bucketDuesAging(
    dues.flatMap((d) => d.tenant.charges),
    today
  );

  return (
    <div className="space-y-4">
      <PageTitle>Ledger</PageTitle>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "payments" | "dues" | "security")}>
        <TabsList className="sticky top-0 z-10 w-full rounded-xl bg-muted p-[3px] shadow-[0_1px_0_var(--border)]">
          <TabsTrigger value="payments" className="flex-1 rounded-lg text-[11.5px] font-bold">
            Payments
          </TabsTrigger>
          <TabsTrigger value="dues" className="flex-1 rounded-lg text-[11.5px] font-bold">
            Dues
            {dues.length > 0 && (
              <span className="ml-1.5 rounded-full bg-ledger px-1.5 py-0.5 text-[10px] font-bold text-ledger-foreground">
                {dues.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex-1 rounded-lg text-[11.5px] font-bold">
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-4">
          <PaymentsTab
            entries={entries}
            expenses={expenses}
            onReceipt={setReceipt}
            manager={manager}
            onChanged={() => router.refresh()}
            initialMonth={initialMonth}
          />
        </TabsContent>

        <TabsContent value="dues" className="mt-4 space-y-4">
          {overdueTotal > 0 && (
            <Panel>
              <p className="font-display text-[15px] font-semibold tracking-tight">How old the {inr(overdueTotal)} is</p>
              <p className="mb-1 text-[11.5px] leading-[1.45] text-muted-foreground">
                Overdue balances, grouped by how many days late they are.
              </p>
              <DuesAgingChart buckets={agingBuckets} />
            </Panel>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total pending" value={inr(totalOutstanding)} tone={totalOutstanding > 0 ? "owed" : "positive"} />
            <StatTile
              label="Of that, overdue"
              value={inr(overdueTotal)}
              tone={overdueTotal > 0 ? "owed" : "muted"}
              hint={`${dues.length} tenant${dues.length === 1 ? "" : "s"} with a balance`}
            />
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setTenantQuery("");
              setPickingTenant(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add due
          </Button>

          {dues.length === 0 ? (
            <EmptyState icon={Sparkles} title="Nobody owes anything">
              Every charge raised so far has been paid in full.
            </EmptyState>
          ) : (
            <>
              <div className="flex gap-2">
                {(["all", "current", "upcoming"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setDuesFilter(f)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      duesFilter === f ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {f === "all" ? "All" : f === "current" ? "Current" : "Upcoming"}
                  </button>
                ))}
              </div>

              {sortedDues.length === 0 ? (
                <EmptyState icon={Sparkles} title="Nothing here">
                  No dues match this filter right now.
                </EmptyState>
              ) : (
                <>
                  <SectionHeading className="mb-0">Oldest first</SectionHeading>
                  <div className="space-y-3">
                    {sortedDues.map((row) => (
                      <DueCard
                        key={row.tenant.id}
                        row={row}
                        manager={manager}
                        onAddCharge={() => setChargeFor(row)}
                        onRemind={() => setRemindTarget(row)}
                        onPay={() => setPayTarget(row)}
                        onChanged={() => router.refresh()}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-4">
          {deposits.tenants.length === 0 ? (
            <EmptyState icon={Sparkles} title="No deposits held">
              Security deposits show up here once tenants are onboarded with one.
            </EmptyState>
          ) : (
            <div className="rounded-2xl border border-marigold/40 bg-marigold/[0.06] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-marigold-foreground">Deposits held</p>
              <p className="mt-1 font-display text-[28px] font-bold leading-none tracking-tight text-marigold-foreground">
                {inr(deposits.total)}
              </p>
              <p className="mt-1.5 text-xs text-marigold-foreground/80">
                {deposits.tenants.length} tenant{deposits.tenants.length === 1 ? "" : "s"}
                {chequeTotal > 0 ? ` · ${inr(chequeTotal)} of it as blank cheques` : ""}
              </p>

              <div className="mt-3 divide-y divide-marigold/20 border-t border-marigold/20">
                {deposits.tenants.map((t) => {
                  const roomLabel = t.room ? `${t.room.floor.name} · Room ${t.room.number}` : t.roomNumber;
                  return (
                    <Link
                      key={t.id}
                      href={`/tenants/${t.id}`}
                      className="flex items-center gap-2.5 py-2.5 first:pt-3"
                    >
                      <ZoomableAvatar src={t.photoUrl} name={t.name} className="h-8 w-8" fallbackClassName="text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{t.name}</p>
                        <p className="truncate text-xs text-marigold-foreground/70">
                          {roomLabel || "No room"} · taken as{" "}
                          {t.depositMethod === "CHEQUE" ? "blank cheque" : paymentMethodLabel(t.depositMethod)} ·{" "}
                          {fmtDate(t.joinDate)}
                        </p>
                      </div>
                      <span className="khata-amount text-sm text-marigold-foreground">{inr(t.depositAmount)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            This only shows deposits actually given. A tenant who still owes part of their deposit shows that as a
            due instead.
          </p>
        </TabsContent>
      </Tabs>

      {payTarget && (
        <LedgerFormDialog
          open={!!payTarget}
          onOpenChange={(o) => {
            if (!o) {
              setPayTarget(null);
              router.refresh();
            }
          }}
          tenants={tenants as never}
          fixedTenantId={payTarget.tenant.id}
          outstandingAmount={payTarget.summary.total.outstanding}
        />
      )}
      {chargeFor && (
        <ChargeFormDialog
          open={!!chargeFor}
          onOpenChange={(o) => !o && setChargeFor(null)}
          tenantId={chargeFor.tenant.id}
          tenantName={chargeFor.tenant.name}
          roomId={chargeFor.tenant.room?.id}
        />
      )}

      <Dialog open={pickingTenant} onOpenChange={setPickingTenant}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a due for</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={tenantQuery}
              onChange={(e) => setTenantQuery(e.target.value)}
              placeholder="Search tenants"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {tenants
              .filter((t) => t.name.toLowerCase().includes(tenantQuery.trim().toLowerCase()))
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setPickingTenant(false);
                    setAddDueTenant(t);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <ZoomableAvatar src={t.photoUrl} name={t.name} className="h-8 w-8" fallbackClassName="text-[10px]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.roomNumber ? `Room ${t.roomNumber}` : "No room"}</p>
                  </div>
                </button>
              ))}
            {tenants.filter((t) => t.name.toLowerCase().includes(tenantQuery.trim().toLowerCase())).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No tenants match that search.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {addDueTenant && (
        <ChargeFormDialog
          open={!!addDueTenant}
          onOpenChange={(o) => {
            if (!o) {
              setAddDueTenant(null);
              router.refresh();
            }
          }}
          tenantId={addDueTenant.id}
          tenantName={addDueTenant.name}
          roomId={addDueTenant.room?.id}
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
          roomId={remindTarget.tenant.room?.id}
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
  expenses,
  onReceipt,
  manager,
  onChanged,
  initialMonth,
}: {
  entries: Entry[];
  expenses: ExpenseRow[];
  onReceipt: (e: Entry) => void;
  manager: string;
  onChanged: () => void;
  initialMonth?: string;
}) {
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(initialMonth ?? "all");
  const [tenantFilter, setTenantFilter] = useState("all");

  // Tenant payments and property spend, one chronological feed, the way a
  // real khata has money in and money out on the same page.
  const feed = useMemo<FeedRow[]>(
    () =>
      [
        ...entries.map((e): FeedRow => ({ kind: "payment", date: e.date, data: e })),
        ...expenses.map((e): FeedRow => ({ kind: "expense", date: e.date, data: e })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [entries, expenses]
  );

  const months = useMemo(
    () => Array.from(new Set(feed.map((r) => monthKey(r.date)))).sort().reverse(),
    [feed]
  );

  // Only tenants who actually have entries, so the picker isn't cluttered
  // with everyone who's never paid anything yet.
  const tenantOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (e.tenant && !seen.has(e.tenant.id)) seen.set(e.tenant.id, e.tenant.name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((r) => {
      // Spend has no tenant, so filtering by one naturally leaves it out.
      if (tenantFilter !== "all" && (r.kind !== "payment" || r.data.tenant?.id !== tenantFilter)) return false;
      if (month !== "all" && monthKey(r.date) !== month) return false;
      if (!q) return true;
      if (r.kind === "payment") {
        return (
          (r.data.tenant?.name ?? "").toLowerCase().includes(q) ||
          (r.data.receiptNo ?? "").toLowerCase().includes(q) ||
          (r.data.note ?? "").toLowerCase().includes(q) ||
          r.data.type.toLowerCase().includes(q)
        );
      }
      return (
        r.data.title.toLowerCase().includes(q) ||
        r.data.category.toLowerCase().includes(q) ||
        (r.data.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [feed, query, month, tenantFilter]);

  // Deposits are held, not earned, so they're totalled separately.
  const payments = list.filter((r) => r.kind === "payment").map((r) => r.data);
  const spend = list.filter((r) => r.kind === "expense").map((r) => r.data);
  const collected = payments.filter((e) => e.type === "RENT" || e.type === "OTHER").reduce((s, e) => s + num(e.amount), 0);
  const deposits = payments.filter((e) => e.type === "DEPOSIT").reduce((s, e) => s + num(e.amount), 0);
  const refunds = payments.filter((e) => e.type === "REFUND").reduce((s, e) => s + num(e.amount), 0);
  const spent = spend.reduce((s, e) => s + num(e.amount), 0);
  const filtered = query || month !== "all" || tenantFilter !== "all";

  async function remove(id: string) {
    await deleteLedgerEntry(manager, id);
    toast.success("Entry deleted");
    onChanged();
  }
  async function removeExpense(id: string) {
    await deleteExpense(manager, id);
    toast.success("Expense deleted");
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
          <Select value={tenantFilter} onValueChange={(v) => v && setTenantFilter(v)}>
            <SelectTrigger className="w-auto flex-1 text-xs">
              <SelectValue placeholder="All tenants">
                {(value: string) =>
                  value === "all" || !value ? "All tenants" : (tenantOptions.find((t) => t.id === value)?.name ?? "All tenants")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenantOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setMonth("all");
                setTenantFilter("all");
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
              {m === "all" ? "All time" : periodLabel(m)}
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
        {spent > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Spent in view</p>
            <Amount value={spent} tone="owed" size="lg" />
          </div>
        )}
      </Panel>

      {list.length === 0 ? (
        <EmptyState icon={BookOpen} title={filtered ? "Nothing matches" : "No payments or spend yet"}>
          {filtered ? "Try a wider date range or clear the filters." : "Record your first payment and it will appear here with a receipt number."}
        </EmptyState>
      ) : (
        <Panel className="py-0">
          {list.map((r, i) => {
            const period = monthKey(r.date);
            const isNewMonth = i === 0 || monthKey(list[i - 1].date) !== period;
            const monthCollected = isNewMonth
              ? list
                  .filter((row) => monthKey(row.date) === period && row.kind === "payment" && row.data.type !== "DEPOSIT" && row.data.type !== "REFUND")
                  .reduce((s, row) => s + num((row.data as Entry).amount), 0)
              : 0;

            return (
              <div key={r.data.id}>
                {isNewMonth && (
                  <div className="flex items-baseline justify-between border-b border-border/70 px-1 pt-3 pb-1.5 first:pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{periodLabel(period)}</p>
                    <Amount value={monthCollected} tone="positive" size="sm" />
                  </div>
                )}
                {r.kind === "payment" ? (
              <KhataRow
                key={r.data.id}
                amount={
                  <div className="text-right">
                    <Amount value={r.data.amount} tone={r.data.type === "REFUND" ? "owed" : r.data.type === "DEPOSIT" ? "held" : "ink"} />
                    <div className="mt-0.5 flex items-center justify-end gap-2">
                      <button onClick={() => onReceipt(r.data)} className="text-[11px] font-semibold text-primary">
                        Receipt
                      </button>
                      <button onClick={() => remove(r.data.id)} className="text-[11px] font-semibold text-destructive">
                        Delete
                      </button>
                    </div>
                  </div>
                }
              >
                <div className="flex items-center gap-2.5">
                  <ZoomableAvatar
                    src={r.data.tenant?.photoUrl}
                    name={r.data.tenant?.name ?? "?"}
                    className="h-8 w-8"
                    fallbackClassName="text-[10px]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {r.data.tenant?.name || "Unknown tenant"}
                      <Badge variant="outline" className="ml-1.5 capitalize">
                        {r.data.type.toLowerCase()}
                      </Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDate(r.data.date)} · {r.data.mode.replace("_", " ").toLowerCase()}
                      {r.data.receiptNo ? <span className="serial font-mono"> · {r.data.receiptNo}</span> : null}
                    </p>
                    {r.data.allocations.length > 0 && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        → {r.data.allocations.map((a) => a.charge.description).join(", ")}
                      </p>
                    )}
                    {r.data.note && <p className="truncate text-[11px] text-muted-foreground">{r.data.note}</p>}
                  </div>
                </div>
              </KhataRow>
            ) : (
              <KhataRow
                key={r.data.id}
                amount={
                  <div className="text-right">
                    <Amount value={r.data.amount} tone="owed" />
                    <button
                      onClick={() => removeExpense(r.data.id)}
                      className="mt-0.5 text-[11px] font-semibold text-destructive"
                    >
                      Delete
                    </button>
                  </div>
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {r.data.title}
                    <Badge variant="outline" className="ml-1.5">
                      Spend
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fmtDate(r.data.date)} · {r.data.category}
                  </p>
                  {r.data.note && <p className="truncate text-[11px] text-muted-foreground">{r.data.note}</p>}
                </div>
              </KhataRow>
                )}
              </div>
            );
          })}
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
  onPay,
  onChanged,
}: {
  row: DueRow;
  manager: string;
  onAddCharge: () => void;
  onRemind: () => void;
  onPay: () => void;
  onChanged: () => void;
}) {
  const { tenant, summary } = row;
  const today = todayISO();
  const open = tenant.charges.filter((c) => chargeOutstanding(c) > 0.005);

  // Paid-so-far against these still-open charges, shown as one line above
  // the total rather than broken out per charge.
  const allocations = open.flatMap((c) => c.allocations);
  const totalPaid = allocations.reduce((s, a) => s + num(a.amount), 0);
  const lastPaymentDate = allocations
    .map((a) => a.ledgerEntry.date)
    .reduce((latest: Date | null, d) => (!latest || new Date(d) > latest ? new Date(d) : latest), null);

  const roomLabel = tenant.room ? `${tenant.room.floor.name} · Room ${tenant.room.number}` : tenant.roomNumber;
  const [confirmWaive, setConfirmWaive] = useState(false);
  const [adjusting, setAdjusting] = useState<{ id: string; description: string; amount: number; paid: number } | null>(null);
  const lastCharge = open[open.length - 1];

  // The single oldest open charge, for the compact "Room 301 · Rent Jun · 63
  // days late" line - the one fact that answers "why is this tenant here."
  const oldest = [...open].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  const oldestDaysLate = oldest
    ? Math.round((new Date(today).getTime() - new Date(oldest.dueDate).getTime()) / 86400000)
    : 0;

  async function toggleWaive(id: string, waived: boolean) {
    await waiveCharge(manager, id, waived);
    toast.success(waived ? "Charge waived" : "Waiver removed");
    onChanged();
  }

  return (
    <Panel className="border-l-[3px] border-l-ledger p-3 pl-[11px]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <Link href={`/tenants/${tenant.id}`} className="flex min-w-0 items-center gap-2.5">
          <ZoomableAvatar src={tenant.photoUrl} name={tenant.name} className="h-9 w-9" fallbackClassName="text-[10px]" />
          <div className="min-w-0">
            <p className="truncate font-display text-[14px] font-bold tracking-tight">{tenant.name}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">
              {[roomLabel, oldest ? `${CHARGE_TYPE_LABELS[oldest.type]} ${periodLabel(oldest.period).split(" ")[0]}` : null]
                .filter(Boolean)
                .join(" · ")}
              {oldestDaysLate > 0 ? ` · ${oldestDaysLate} days late` : ""}
            </p>
          </div>
        </Link>
        <div className="text-right">
          <Amount value={summary.total.outstanding} tone="owed" size="lg" />
          <button onClick={onRemind} className="mt-0.5 text-[11px] font-bold text-primary">
            Remind
          </button>
        </div>
      </div>

      <div className="border-t border-border/70">
        {open.map((charge) => {
          const late = new Date(charge.dueDate).toISOString().slice(0, 10) < today;

          return (
            <KhataRow
              key={charge.id}
              className="py-2.5"
              amount={
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setAdjusting({ id: charge.id, description: charge.description, amount: num(charge.amount), paid: chargePaid(charge) })
                    }
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    title="Settle for a different amount"
                  >
                    Edit
                  </button>
                  <Amount value={num(charge.amount)} tone="owed" size="sm" />
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
                  </p>
                </div>
              </div>
            </KhataRow>
          );
        })}
        {totalPaid > 0 && (
          <KhataRow className="py-1.5" amount={<span className="khata-amount text-sm text-positive">− {inr(totalPaid)}</span>}>
            <p className="text-xs font-semibold text-positive">
              Partially paid{lastPaymentDate ? ` · ${fmtDate(lastPaymentDate)}` : ""}
            </p>
          </KhataRow>
        )}
        <KhataRow className="py-2.5" amount={<Amount value={summary.total.outstanding} tone="owed" size="sm" />}>
          <p className="text-sm font-semibold">Total due</p>
        </KhataRow>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3">
        <Button size="sm" onClick={onPay}>
          <IndianRupee className="h-3.5 w-3.5" /> Paid
        </Button>
        <Button size="sm" variant="outline" onClick={onAddCharge}>
          <Plus className="h-3.5 w-3.5" /> Add charge
        </Button>
        <Link href={`/tenants/${tenant.id}`} className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}>
          <Receipt className="h-3.5 w-3.5" /> Open tenant
        </Link>
        {open.length > 0 && (
          <button
            onClick={() => setConfirmWaive(true)}
            className="ml-auto self-center text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Waive last charge
          </button>
        )}
      </div>

      <Dialog open={confirmWaive} onOpenChange={setConfirmWaive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive this charge?</DialogTitle>
          </DialogHeader>
          {lastCharge && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {CHARGE_TYPE_LABELS[lastCharge.type]} · {lastCharge.description}
                </span>{" "}
                for {tenant.name}, due {fmtDate(lastCharge.dueDate)}, will no longer count as owed. It stays on
                record, marked waived, but drops out of their total due and out of anything you send them to chase.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmWaive(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    toggleWaive(lastCharge.id, true);
                    setConfirmWaive(false);
                  }}
                >
                  Waive {inr(chargeOutstanding(lastCharge))}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {adjusting && (
        <AdjustChargeDialog key={adjusting.id} open onOpenChange={(o) => !o && setAdjusting(null)} charge={adjusting} />
      )}
    </Panel>
  );
}
