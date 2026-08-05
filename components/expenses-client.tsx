"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet, Zap } from "lucide-react";
import { ExpenseFormDialog } from "@/components/expense-form-dialog";
import { MeterReadingDialog } from "@/components/meter-reading-dialog";
import { deleteElectricityBill } from "@/app/actions/electricity";
import { toggleExpenseActive, deleteExpense } from "@/app/actions/expenses";
import { useManager } from "@/lib/manager-context";
import { Amount, EmptyState, KhataRow, PageTitle, Panel, SectionHeading, StatTile } from "@/components/khata";
import { inr, fmtDate, monthKey } from "@/lib/format";
import { periodLabel, round2 } from "@/lib/charges";
import { toast } from "sonner";
import type { ExpenseModel } from "@/lib/generated/prisma/models";
import type { getElectricityRecovery } from "@/app/actions/electricity";

type Recovery = Awaited<ReturnType<typeof getElectricityRecovery>>;

export function ExpensesClient({
  expenses,
  recovery,
  electricityRate,
}: {
  expenses: ExpenseModel[];
  recovery: Recovery;
  electricityRate: number;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [formOpen, setFormOpen] = useState(false);
  const [meterOpen, setMeterOpen] = useState(false);
  const lastMainReading = recovery.periods[0];

  async function handleDeleteReading(id: string) {
    await deleteElectricityBill(manager, id);
    toast.success("Reading deleted");
    router.refresh();
  }

  const thisMonth = monthKey(new Date());
  const recurring = expenses.filter((e) => e.frequency !== "ONE_TIME" && e.active);
  const monthlyTotal = round2(
    recurring.filter((e) => e.frequency === "MONTHLY").reduce((s, e) => s + Number(e.amount), 0) +
      recurring.filter((e) => e.frequency === "YEARLY").reduce((s, e) => s + Number(e.amount) / 12, 0)
  );
  // Every one-time expense this month, minus the main-meter reading — its full
  // gross cost double-counts with the recovery card below.
  const oneTimeThisMonth = expenses
    .filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === thisMonth && e.category !== "Electricity (main meter)")
    .reduce((s, e) => s + Number(e.amount), 0);

  async function handleToggle(id: string, active: boolean) {
    await toggleExpenseActive(manager, id, active);
    router.refresh();
  }
  async function handleDelete(id: string) {
    await deleteExpense(manager, id);
    toast.success("Expense deleted");
    router.refresh();
  }

  return (
    <div>
      <PageTitle
        action={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        }
      >
        Expenses
      </PageTitle>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile label="Monthly recurring" value={inr(monthlyTotal)} />
        <StatTile label="One-time this month" value={inr(oneTimeThisMonth)} />
      </div>

      <Panel className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-base font-semibold tracking-tight">Main meter electricity</p>
          <Button size="sm" variant="secondary" onClick={() => setMeterOpen(true)}>
            <Zap className="h-3.5 w-3.5" /> Log reading
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          The building&apos;s connection, covering rooms and common areas together. What tenants repay through their
          own meters is netted off below to show what electricity actually costs you.
        </p>

        {recovery.periods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No readings logged yet.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Gross</p>
                <Amount value={recovery.totals.gross} size="sm" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Recovered</p>
                <Amount value={recovery.totals.recovered} tone="positive" size="sm" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Net cost</p>
                <Amount value={recovery.totals.net} tone="owed" size="sm" />
              </div>
            </div>

            <div className="space-y-2">
              {recovery.periods.map((p) => (
                <KhataRow
                  key={p.id}
                  className="py-2"
                  amount={
                    <div className="text-right">
                      <Amount value={p.net} tone="owed" size="sm" />
                      <p className="text-[11px] text-muted-foreground">net of {inr(p.gross)}</p>
                    </div>
                  }
                >
                  <p className="text-sm">
                    {periodLabel(p.period)} · {fmtDate(p.startDate)} → {fmtDate(p.endDate)} · {p.units} units
                  </p>
                  <button onClick={() => handleDeleteReading(p.id)} className="text-xs text-destructive">
                    Delete
                  </button>
                </KhataRow>
              ))}
            </div>
          </>
        )}
      </Panel>

      {recurring.length > 0 && (
        <div className="mb-4">
          <SectionHeading>Active recurring expenses</SectionHeading>
          <div className="space-y-2">
            {recurring.map((e) => (
              <KhataRow
                key={e.id}
                className="rounded-xl border border-border bg-background px-3"
                amount={
                  <div className="text-right">
                    <Amount value={e.amount} size="sm" />
                    <button onClick={() => handleToggle(e.id, false)} className="block text-[11px] text-destructive">
                      Stop
                    </button>
                  </div>
                }
              >
                <p className="text-sm font-semibold">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {e.category} · {e.frequency === "MONTHLY" ? "monthly" : "yearly"}
                </p>
              </KhataRow>
            ))}
          </div>
        </div>
      )}

      {expenses.length === 0 && (
        <EmptyState icon={Wallet} title="No expenses yet">
          Track maid, wifi, repairs, and anything else you spend on the PG — recurring or one-time.
        </EmptyState>
      )}

      <SectionHeading>All expenses</SectionHeading>
      <div className="space-y-2">
        {expenses.map((e) => (
          <KhataRow
            key={e.id}
            className="rounded-xl border border-border bg-background px-3"
            amount={
              <div className="text-right">
                <Amount value={e.amount} size="sm" />
                <button onClick={() => handleDelete(e.id)} className="block text-[11px] text-destructive">
                  Delete
                </button>
              </div>
            }
          >
            <p className="text-sm font-semibold">
              {e.title} {!e.active && e.frequency !== "ONE_TIME" && <Badge variant="outline">Stopped</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">
              {e.category} · {fmtDate(e.date)} · {e.frequency === "ONE_TIME" ? "one-time" : e.frequency.toLowerCase()}
            </p>
            {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
          </KhataRow>
        ))}
      </div>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <MeterReadingDialog
        key={meterOpen ? "open" : "closed"}
        open={meterOpen}
        onOpenChange={setMeterOpen}
        isMainMeter
        defaultRate={electricityRate}
        lastReading={
          lastMainReading
            ? { endReading: lastMainReading.endReading, endDate: lastMainReading.endDate.toISOString() }
            : null
        }
      />
    </div>
  );
}
