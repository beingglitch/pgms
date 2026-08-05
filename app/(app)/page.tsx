import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Amount, EmptyState, KhataRow, Panel, SectionHeading, StatTile } from "@/components/khata";
import { CollectionsChart, OutstandingBar, type MonthPoint } from "@/components/charts";
import { getPgInfo } from "@/app/actions/settings";
import { getBuilding } from "@/app/actions/rooms";
import { getDepositLiability } from "@/app/actions/reports";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { listActivity } from "@/app/actions/activity";
import { inr, fmtDate, monthKey, todayISO, daysFromNowISO, dateISO, initials } from "@/lib/format";
import { chargeOutstanding, num, periodLabel, round2 } from "@/lib/charges";
import { ChevronRight, Sparkles, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

/** The last six billing months, oldest first. */
function recentPeriods(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export default async function DashboardPage() {
  const [pgInfo, building, deposits, dues, charges, payments, activity, expenses] = await Promise.all([
    getPgInfo(),
    getBuilding(),
    getDepositLiability(),
    listOutstandingByTenant(),
    prisma.charge.findMany({ include: { allocations: { select: { amount: true } } } }),
    // Every payment, not a page of them — the old dashboard summed only the six
    // most recent entries and under-reported the month.
    prisma.ledgerEntry.findMany({
      where: { type: { in: ["RENT", "OTHER"] } },
      select: { amount: true, date: true },
    }),
    listActivity(8),
    prisma.expense.findMany({ where: { active: true } }),
  ]);

  const thisMonth = monthKey(new Date());
  const today = todayISO();
  const horizon = daysFromNowISO(pgInfo.dueSoonDays);

  const collectedThisMonth = round2(
    payments.filter((p) => monthKey(p.date) === thisMonth).reduce((s, p) => s + num(p.amount), 0)
  );

  const outstandingTotal = round2(dues.reduce((s, d) => s + d.summary.total.outstanding, 0));
  const overdueTotal = round2(dues.reduce((s, d) => s + d.summary.overdue, 0));
  const overdueRows = dues.filter((d) => d.summary.overdue > 0);

  const dueSoon = dues.filter((row) =>
    row.tenant.charges.some((c) => {
      if (chargeOutstanding(c) <= 0.005) return false;
      const day = dateISO(c.dueDate);
      return day >= today && day <= horizon;
    })
  );

  const byType = { RENT: 0, ELECTRICITY: 0, OTHER: 0 };
  for (const charge of charges) {
    const owed = chargeOutstanding(charge);
    if (owed <= 0.005) continue;
    if (charge.type === "RENT") byType.RENT += owed;
    else if (charge.type === "ELECTRICITY") byType.ELECTRICITY += owed;
    else byType.OTHER += owed;
  }

  const monthly: MonthPoint[] = recentPeriods().map((period) => {
    const forPeriod = charges.filter((c) => c.period === period && !c.waived);
    return {
      period,
      billed: round2(forPeriod.reduce((s, c) => s + num(c.amount), 0)),
      collected: round2(
        forPeriod.reduce((s, c) => s + c.allocations.reduce((a, x) => a + num(x.amount), 0), 0)
      ),
    };
  });

  // Yearly costs are averaged so the figure means "per month" throughout.
  const monthlyExpenses = round2(
    expenses.filter((e) => e.frequency === "MONTHLY").reduce((s, e) => s + num(e.amount), 0) +
      expenses.filter((e) => e.frequency === "YEARLY").reduce((s, e) => s + num(e.amount) / 12, 0)
  );

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
          value={`${building.totals.occupied}/${building.totals.beds || "—"}`}
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
          href="/ledger?tab=dues"
        />
        <StatTile
          label={`Due in ${pgInfo.dueSoonDays} days`}
          value={dueSoon.length}
          hint="Change this window in Settings"
          href="/ledger?tab=dues"
        />
        <StatTile
          label="Deposits held"
          value={inr(deposits.held)}
          tone="held"
          hint={deposits.asCheque > 0 ? `${inr(deposits.asCheque)} as cheques` : "Owed back on checkout"}
        />
      </div>

      <Panel>
        <SectionHeading>Billed vs collected</SectionHeading>
        <CollectionsChart data={monthly} />
      </Panel>

      {outstandingTotal > 0 && (
        <Panel>
          <SectionHeading
            action={
              <Link href="/ledger?tab=dues" className="text-xs font-semibold text-primary">
                See who owes
              </Link>
            }
          >
            What&apos;s outstanding
          </SectionHeading>
          <OutstandingBar
            slices={[
              { label: "Rent", value: round2(byType.RENT), fill: "var(--chart-rent)" },
              { label: "Electricity", value: round2(byType.ELECTRICITY), fill: "var(--chart-power)" },
              { label: "Other charges", value: round2(byType.OTHER), fill: "var(--chart-other)" },
            ]}
          />
        </Panel>
      )}

      <Panel>
        <SectionHeading
          action={
            <Link href="/ledger?tab=dues" className="text-xs font-semibold text-primary">
              All dues
            </Link>
          }
        >
          Who owes right now
        </SectionHeading>
        {dues.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Everyone is settled up. Nothing to chase.</p>
        ) : (
          dues.slice(0, 5).map(({ tenant, summary }) => (
            <KhataRow
              key={tenant.id}
              amount={
                <div className="text-right">
                  <Amount value={summary.total.outstanding} tone="owed" />
                  {summary.overdue > 0 && <p className="text-[11px] font-semibold text-ledger">overdue</p>}
                </div>
              }
            >
              <Link href={`/tenants/${tenant.id}`} className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={tenant.photoUrl ?? undefined} />
                  <AvatarFallback className="text-[10px]">{initials(tenant.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{tenant.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tenant.room ? `Room ${tenant.room.number}` : tenant.roomNumber || "No room"} ·{" "}
                    {tenant.charges.filter((c) => chargeOutstanding(c) > 0.005).length} open
                  </p>
                </div>
              </Link>
            </KhataRow>
          ))
        )}
      </Panel>

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

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Monthly running costs"
          value={inr(monthlyExpenses)}
          hint="Recurring spend, yearly costs averaged"
          href="/expenses"
        />
        <StatTile label="Tenants" value={building.totals.occupied} hint={`${dues.length} with a balance`} href="/tenants" />
      </div>

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
            Everything you do — payments, readings, edits — gets recorded here.
          </EmptyState>
        ) : (
          activity.map((entry) => (
            <div key={entry.id} className="khata-row py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-semibold">{entry.action}</span>
                  {entry.detail ? <span className="text-muted-foreground"> — {entry.detail}</span> : null}
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
