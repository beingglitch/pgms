import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Amount, EmptyState, KhataRow, Panel, SectionHeading, StatTile } from "@/components/khata";
import { getBuilding } from "@/app/actions/rooms";
import { getDepositLiability } from "@/app/actions/reports";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { listActivity } from "@/app/actions/activity";
import { getPgInfo } from "@/app/actions/settings";
import { FinanceChart, type MonthFinance } from "@/components/finance-chart";
import { inr, fmtDate, monthKey, todayISO, daysFromNowISO, dateISO } from "@/lib/format";
import { chargeOutstanding, num, periodLabel, round2 } from "@/lib/charges";
import { ChevronRight, Sparkles, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [building, deposits, dues, payments, activity, expenses, pgInfo] = await Promise.all([
    getBuilding(),
    getDepositLiability(),
    listOutstandingByTenant(),
    // Every payment, not a page of them. The old dashboard summed only the six
    // most recent entries and under-reported the month.
    prisma.ledgerEntry.findMany({
      where: { type: { in: ["RENT", "OTHER"] } },
      select: { amount: true, date: true, type: true },
    }),
    listActivity(8),
    prisma.expense.findMany({ where: { active: true } }),
    getPgInfo(),
  ]);

  const thisMonth = monthKey(new Date());

  const collectedThisMonth = round2(
    payments.filter((p) => monthKey(p.date) === thisMonth).reduce((s, p) => s + num(p.amount), 0)
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

  // Yearly costs are averaged so the figure means "per month" throughout.
  const recurringExpenses = round2(
    expenses.filter((e) => e.frequency === "MONTHLY").reduce((s, e) => s + num(e.amount), 0) +
      expenses.filter((e) => e.frequency === "YEARLY").reduce((s, e) => s + num(e.amount) / 12, 0)
  );
  const oneTimeThisMonth = round2(
    expenses
      .filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === thisMonth)
      .reduce((s, e) => s + num(e.amount), 0)
  );
  const totalThisMonth = round2(recurringExpenses + oneTimeThisMonth);

  // Two years back, oldest first. The chart itself only shows a handful at
  // once, but keeps the rest around to pan and zoom into.
  const chartMonths: string[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    chartMonths.push(monthKey(d));
  }
  const financeData: MonthFinance[] = chartMonths.map((period) => {
    const collected = round2(
      payments.filter((p) => monthKey(p.date) === period).reduce((s, p) => s + num(p.amount), 0)
    );
    const rent = round2(
      payments
        .filter((p) => monthKey(p.date) === period && p.type === "RENT")
        .reduce((s, p) => s + num(p.amount), 0)
    );
    const oneTime = expenses
      .filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === period)
      .reduce((s, e) => s + num(e.amount), 0);
    const monthly = expenses
      .filter((e) => e.frequency === "MONTHLY" && monthKey(e.date) <= period)
      .reduce((s, e) => s + num(e.amount), 0);
    const yearly = expenses
      .filter((e) => e.frequency === "YEARLY" && monthKey(e.date) <= period)
      .reduce((s, e) => s + num(e.amount) / 12, 0);
    return { period, collected, rent, spend: round2(oneTime + monthly + yearly) };
  });

  return (
    <div className="space-y-5">
      {/* The hero answers the question the owner opens the app to ask. */}
      <section>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {periodLabel(thisMonth)}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <Amount value={collectedThisMonth} tone="positive" size="xl" />
            <p className="mt-0.5 text-sm text-muted-foreground">collected this month</p>
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
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Beds filled"
          value={`${building.totals.occupied}/${building.totals.beds}`}
          hint={
            building.totals.beds > 0
              ? `${building.totals.beds - building.totals.occupied} vacant`
              : "Map out your rooms"
          }
          href="/rooms"
        />
        <StatTile
          label="Overdue"
          value={overdueRows.length}
          tone={overdueRows.length > 0 ? "owed" : "muted"}
          hint={overdueRows.length > 0 ? `${inr(overdueTotal)} past due` : "Nobody is late"}
          href="/ledger?tab=dues&filter=current"
        />
        <StatTile
          label={`Due in ${pgInfo.dueSoonDays} days`}
          value={dueSoonRows.length}
          tone={dueSoonRows.length > 0 ? "owed" : "muted"}
          hint={dueSoonRows.length > 0 ? `${inr(dueSoonTotal)} coming up` : "Nothing coming up"}
          href="/ledger?tab=dues&filter=upcoming"
        />
        <StatTile
          label="Monthly running costs"
          value={inr(totalThisMonth)}
          hint={`${inr(recurringExpenses)} recurring`}
          href="/expenses"
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

      <Panel>
        <SectionHeading>Collections, rent, and spends</SectionHeading>
        <FinanceChart data={financeData} />
      </Panel>

      <Panel>
        <SectionHeading
          action={
            <Link href="/settings" className="text-xs font-semibold text-primary">
              Full log
            </Link>
          }
        >
          Recent activity
        </SectionHeading>
        {activity.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nothing yet">
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
        <EmptyState icon={Wallet} title="Start by mapping your building">
          Add floors and rooms so rent splits per bed and every meter reading knows who to charge.
        </EmptyState>
      )}
    </div>
  );
}
