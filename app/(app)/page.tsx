import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Amount, EmptyState, KhataRow, Panel, SectionHeading, StatTile } from "@/components/khata";
import { getBuilding } from "@/app/actions/rooms";
import { getBilledByPeriod, getCollectionsByPeriod, getDepositLiability, getOccupancyHistory } from "@/app/actions/reports";
import { generateDueRentCharges, listOutstandingByTenant } from "@/app/actions/charges";
import { listActivity } from "@/app/actions/activity";
import { getPgInfo } from "@/app/actions/settings";
import { requireAccountId } from "@/app/actions/auth";
import { DashboardChart, type MonthPoint } from "@/components/dashboard-chart";
import { ChaseStrip, type ChaseRow } from "@/components/chase-strip";
import { MonthSelect } from "@/components/month-select";
import { inr, fmtDate, monthKey, todayISO, daysFromNowISO, dateISO } from "@/lib/format";
import { bucketDuesAging, chargeOutstanding, fiscalYearOf, num, periodLabel, round2 } from "@/lib/charges";
import { AlertTriangle, ChevronRight, DoorOpen, Sparkles, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const accountId = await requireAccountId();

  // Rent charges are created daily by the cron, but the owner opening the
  // app is the surest daily event there is, so catch up here too. Idempotent
  // and cheap when there's nothing to do; `revalidate: false` because this
  // is a render, where revalidatePath isn't allowed.
  await generateDueRentCharges(accountId, "System", { revalidate: false });

  const [building, deposits, dues, collectionsByPeriod, billedByPeriod, occupancyHistory, activity, expenses, pgInfo, params] =
    await Promise.all([
      getBuilding(),
      getDepositLiability(),
      listOutstandingByTenant(),
      // Grouped by the billing period each payment actually paid off (via its
      // charge allocations), not the date it happened to be paid on - so rent
      // for June/July paid in August lands on June/July, not August.
      getCollectionsByPeriod(),
      getBilledByPeriod(),
      getOccupancyHistory(6),
      listActivity(3),
      prisma.expense.findMany({ where: { accountId, active: true } }),
      getPgInfo(),
      searchParams,
    ]);

  const thisMonth = monthKey(new Date());
  const selectedMonth = params.month && /^\d{4}-\d{2}$/.test(params.month) && params.month <= thisMonth ? params.month : thisMonth;

  const collectedSelectedMonth = collectionsByPeriod.get(selectedMonth)?.collected ?? 0;
  const billedSelectedMonth = billedByPeriod.get(selectedMonth) ?? 0;

  const fiscalYear = fiscalYearOf(selectedMonth, pgInfo.fiscalYearStartMonth);
  const rentCollectedThisFiscalYear = round2(
    Array.from(collectionsByPeriod.entries())
      .filter(([period]) => period >= fiscalYear.start && period <= fiscalYear.end)
      .reduce((s, [, row]) => s + row.rent, 0)
  );

  const outstandingTotal = round2(dues.reduce((s, d) => s + d.summary.total.outstanding, 0));
  const overdueTotal = round2(dues.reduce((s, d) => s + d.summary.overdue, 0));
  const overdueRows = dues.filter((d) => d.summary.overdue > 0);

  // Upcoming: outstanding charges due later, within the Settings window, but
  // not yet due today or overdue (that's the Overdue tile's job).
  const today = todayISO();
  const horizon = daysFromNowISO(pgInfo.dueSoonDays);
  const dueSoonRows = dues.filter((d) =>
    d.tenant.charges.some((c) => {
      if (chargeOutstanding(c) <= 0.005) return false;
      const day = dateISO(c.dueDate);
      return day > today && day <= horizon;
    })
  );
  const dueSoonTotal = round2(
    dueSoonRows.reduce((s, d) => {
      const rowSoon = d.tenant.charges
        .filter((c) => chargeOutstanding(c) > 0.005)
        .filter((c) => {
          const day = dateISO(c.dueDate);
          return day > today && day <= horizon;
        })
        .reduce((rs, c) => rs + chargeOutstanding(c), 0);
      return s + rowSoon;
    }, 0)
  );

  // The progress bar only makes sense against the live "today", so it's tied
  // to the real current month regardless of which month is picked above it.
  const billedThisMonth = billedByPeriod.get(thisMonth) ?? 0;
  const collectedThisMonth = collectionsByPeriod.get(thisMonth)?.collected ?? 0;
  const pct = (n: number) => (billedThisMonth > 0 ? Math.round((n / billedThisMonth) * 100) : 0);
  const collectedPct = pct(collectedThisMonth);
  const dueSoonPct = pct(dueSoonTotal);
  const overduePct = pct(overdueTotal);

  // Chase strip: everyone with something overdue, oldest-late first.
  const chaseRows: ChaseRow[] = overdueRows
    .map((d) => {
      const overdueCharges = d.tenant.charges.filter((c) => chargeOutstanding(c) > 0.005 && dateISO(c.dueDate) < today);
      if (overdueCharges.length === 0) return null;
      const oldestDue = overdueCharges.reduce(
        (min, c) => (dateISO(c.dueDate) < min ? dateISO(c.dueDate) : min),
        dateISO(overdueCharges[0].dueDate)
      );
      const daysLate = Math.round((new Date(today).getTime() - new Date(oldestDue).getTime()) / 86400000);
      const row: ChaseRow = {
        tenant: {
          id: d.tenant.id,
          name: d.tenant.name,
          phone: d.tenant.phone,
          email: d.tenant.email,
          roomNumber: d.tenant.roomNumber,
          rentAmount: num(d.tenant.rentAmount),
          room: d.tenant.room ? { id: d.tenant.room.id, number: d.tenant.room.number } : null,
        },
        outstanding: d.summary.total.outstanding,
        daysLate,
      };
      return row;
    })
    .filter((r): r is ChaseRow => r !== null)
    .sort((a, b) => b.daysLate - a.daysLate);

  // The month picker goes back further than the chart: a plain 12 calendar
  // years of months, independent of the fiscal-year start setting.
  const pickerMonths: string[] = [];
  for (let i = 143; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    pickerMonths.push(monthKey(d));
  }

  // The chart card's own fixed 6-month window (no zoom/pan, per the redesign).
  const chartMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    chartMonths.push(monthKey(d));
  }
  const monthShort = (period: string) => periodLabel(period).split(" ")[0].slice(0, 3);

  const chartData: MonthPoint[] = chartMonths.map((period) => {
    const row = collectionsByPeriod.get(period);
    const collected = row?.collected ?? 0;
    const billed = billedByPeriod.get(period) ?? 0;
    const oneTime = expenses
      .filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === period)
      .reduce((s, e) => s + num(e.amount), 0);
    const monthly = expenses
      .filter((e) => e.frequency === "MONTHLY" && monthKey(e.date) <= period)
      .reduce((s, e) => s + num(e.amount), 0);
    const yearly = expenses
      .filter((e) => e.frequency === "YEARLY" && monthKey(e.date) <= period)
      .reduce((s, e) => s + num(e.amount) / 12, 0);
    const spend = round2(oneTime + monthly + yearly);
    return {
      period,
      short: monthShort(period),
      billed,
      collected,
      spend,
      net: round2(collected - spend),
      ratePct: billed > 0 ? Math.round((collected / billed) * 100) : 100,
    };
  });

  const occupiedPoints = occupancyHistory.map((p) => ({ ...p, short: monthShort(p.period) }));

  const allOutstandingCharges = dues.flatMap((d) => d.tenant.charges);
  const agingBuckets = bucketDuesAging(allOutstandingCharges, today);

  // Bed-by-bed status for the segmented strip: filled / on notice / vacant.
  // Derived here (not from getBuilding, which doesn't carry notice state) by
  // cross-referencing the same tenants already loaded for "leaving soon".
  const noticeTenantIds = new Set(deposits.leavingSoon.map((t) => t.id));
  const bedStatuses = building.floors.flatMap((f) =>
    f.rooms.flatMap((r) => r.beds.map((b) => (!b.tenant ? "vacant" : noticeTenantIds.has(b.tenant.id) ? "notice" : "filled")))
  );

  return (
    <div className="space-y-5">
      {/* The hero answers the question the owner opens the app to ask. */}
      <section>
        <MonthSelect months={pickerMonths} value={selectedMonth} />
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <span className="flex items-baseline gap-1.5">
              <Amount value={collectedSelectedMonth} tone="positive" size="xl" />
              {billedSelectedMonth > 0 && (
                <Link
                  href={`/ledger?tab=billed&month=${selectedMonth}`}
                  className="text-sm text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  of {inr(billedSelectedMonth)} billed
                </Link>
              )}
            </span>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {selectedMonth === thisMonth ? "collected this month" : `collected in ${periodLabel(selectedMonth)}`}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              <strong className="tabular text-foreground">{inr(rentCollectedThisFiscalYear)}</strong> rent collected
              in {fiscalYear.label}
            </p>
          </div>
          {outstandingTotal > 0 && (
            <Link href="/ledger?tab=dues" className="group text-right">
              <Amount value={outstandingTotal} tone="owed" size="lg" />
              <p className="mt-0.5 flex items-center justify-end gap-1 text-sm text-muted-foreground">
                still to come in
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </p>
            </Link>
          )}
        </div>

        {billedThisMonth > 0 && (
          <div className="mt-3">
            <div className="flex h-[9px] w-full overflow-hidden rounded-full bg-border">
              <div className="h-full bg-chart-rent" style={{ width: `${Math.min(100, collectedPct)}%` }} />
              <div className="h-full bg-marigold" style={{ width: `${Math.min(100 - collectedPct, dueSoonPct)}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {collectedPct}% collected · {dueSoonPct}% due in {pgInfo.dueSoonDays} days · {overduePct}% overdue
            </p>
          </div>
        )}
      </section>

      <ChaseStrip
        rows={chaseRows}
        tenants={dues.map((d) => ({
          id: d.tenant.id,
          name: d.tenant.name,
          roomNumber: d.tenant.roomNumber,
          rentAmount: num(d.tenant.rentAmount),
        }))}
        signature={{ pgName: pgInfo.name, ownerName: pgInfo.ownerName, contact: pgInfo.contact }}
        paymentLink={pgInfo.paymentLink}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Beds filled"
          icon={DoorOpen}
          chip="blue"
          value={`${building.totals.occupied}/${building.totals.beds}`}
          hint={
            <span className="mt-0.5 flex gap-[3px]">
              {bedStatuses.length === 0 ? (
                <span className="text-muted-foreground">Map out your rooms</span>
              ) : (
                bedStatuses.map((status, i) => (
                  <span
                    key={i}
                    className={
                      "h-2 flex-1 rounded-sm " +
                      (status === "filled" ? "bg-primary" : status === "notice" ? "bg-marigold" : "bg-input")
                    }
                  />
                ))
              )}
            </span>
          }
          href="/rooms"
        />
        <StatTile
          label="Overdue"
          icon={AlertTriangle}
          chip="orange"
          value={inr(overdueTotal)}
          tone={overdueRows.length > 0 ? "owed" : "muted"}
          hint={overdueRows.length > 0 ? `${overdueRows.length} tenants · oldest ${chaseRows[0]?.daysLate ?? 0} days` : "Nobody is late"}
          href="/ledger?tab=dues&filter=current"
        />
      </div>

      {deposits.leavingSoon.length > 0 && (
        <Panel className="border-marigold/40 bg-marigold/5">
          <SectionHeading>Leaving soon</SectionHeading>
          {deposits.leavingSoon.map((t) => (
            <KhataRow key={t.id} amount={<Amount value={t.depositAmount} tone="held" size="sm" />}>
              <Link href={`/tenants/${t.id}`}>
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.room ? `Room ${t.room.number} · ` : ""}bed free from {fmtDate(t.expectedVacateDate)}
                </p>
              </Link>
            </KhataRow>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            {inr(deposits.dueBackSoon)} of deposit comes due when they leave.
          </p>
        </Panel>
      )}

      <DashboardChart months={chartData} occupied={occupiedPoints} capacity={building.totals.beds} aging={agingBuckets} />

      <Panel>
        <SectionHeading
          action={
            <Link href="/activity" className="text-xs font-semibold text-primary">
              Full log
            </Link>
          }
        >
          Recent activity
        </SectionHeading>
        {activity.length === 0 ? (
          <EmptyState icon={Sparkles} chip="purple" title="Nothing yet">
            Everything you do (payments, readings, edits) gets recorded here.
          </EmptyState>
        ) : (
          activity.map((entry) => (
            <div key={entry.id} className="khata-row py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-semibold">{entry.action}</span>
                  {entry.detail ? <span className="text-muted-foreground">: {entry.detail}</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {entry.actor} ·{" "}
                  {new Date(entry.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            </div>
          ))
        )}
      </Panel>

      {building.totals.beds === 0 && (
        <EmptyState icon={Wallet} chip="orange" title="Start by mapping your building">
          Add floors and rooms so rent splits per bed and every meter reading knows who to charge.
        </EmptyState>
      )}
    </div>
  );
}
