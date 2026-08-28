"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet } from "lucide-react";
import { ExpenseFormDialog } from "@/components/expense-form-dialog";
import { toggleExpenseActive, deleteExpense } from "@/app/actions/expenses";
import { useManager } from "@/lib/manager-context";
import { Amount, EmptyState, KhataRow, Panel, SectionHeading } from "@/components/khata";
import { inr, fmtDate, monthKey } from "@/lib/format";
import { round2 } from "@/lib/charges";
import { toast } from "sonner";
import type { ExpenseModel } from "@/lib/generated/prisma/models";

// Cycled by category so each gets a stable, distinct dot colour; "Electricity"
// (by name, case-insensitive) always gets the token the rest of the app
// already associates with power, so the reconciliation line and the dot agree.
const CATEGORY_COLORS = ["var(--chart-power)", "var(--chart-other)", "var(--chart-4)", "var(--chart-5)", "var(--primary)", "var(--marigold)"];

function colorForCategory(category: string, fallbackIndex: number) {
  if (category.trim().toLowerCase() === "electricity") return "var(--chart-power)";
  return CATEGORY_COLORS[fallbackIndex % CATEGORY_COLORS.length];
}

export function ExpensesClient({
  expenses,
  electricityBilledBack,
}: {
  expenses: ExpenseModel[];
  electricityBilledBack: number;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [formOpen, setFormOpen] = useState(false);

  const thisMonth = monthKey(new Date());
  const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long" }).toUpperCase();
  const recurring = expenses.filter((e) => e.frequency !== "ONE_TIME" && e.active);
  const monthlyTotal = round2(
    recurring.filter((e) => e.frequency === "MONTHLY").reduce((s, e) => s + Number(e.amount), 0) +
      recurring.filter((e) => e.frequency === "YEARLY").reduce((s, e) => s + Number(e.amount) / 12, 0)
  );
  const oneTimeThisMonth = round2(
    expenses
      .filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === thisMonth)
      .reduce((s, e) => s + Number(e.amount), 0)
  );
  const spentThisMonth = round2(monthlyTotal + oneTimeThisMonth);
  const total = round2(expenses.reduce((s, e) => s + Number(e.amount), 0));

  // This month's spend, broken down by category: recurring expenses
  // contribute their monthly-equivalent regardless of when they were first
  // added, one-time expenses only if they landed this month.
  const byCategory = new Map<string, number>();
  for (const e of recurring) {
    const monthly = e.frequency === "MONTHLY" ? Number(e.amount) : Number(e.amount) / 12;
    byCategory.set(e.category, round2((byCategory.get(e.category) ?? 0) + monthly));
  }
  for (const e of expenses.filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === thisMonth)) {
    byCategory.set(e.category, round2((byCategory.get(e.category) ?? 0) + Number(e.amount)));
  }
  const categoryRows = Array.from(byCategory.entries())
    .map(([category, amount], i) => ({
      category,
      amount,
      color: colorForCategory(category, i),
      share: spentThisMonth > 0 ? Math.round((amount / spentThisMonth) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const electricityRow = categoryRows.find((r) => r.category.trim().toLowerCase() === "electricity");

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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Spent in {monthLabel}</p>
          <p className="mt-0.5 font-display text-[32px] font-semibold leading-none tracking-tight tabular text-chart-power">
            {inr(spentThisMonth)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {inr(monthlyTotal)} recurring · {inr(oneTimeThisMonth)} one-time
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Add expense
        </Button>
      </div>

      {categoryRows.length > 0 && (
        <div className="flex h-3.5 overflow-hidden rounded-[7px]">
          {categoryRows.map((r) => (
            <div key={r.category} style={{ width: `${r.share}%`, background: r.color }} title={`${r.category}: ${r.share}%`} />
          ))}
        </div>
      )}

      {categoryRows.length > 0 && (
        <div className="space-y-2.5">
          {categoryRows.map((r) => (
            <div key={r.category} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{r.category}</p>
              </div>
              <div className="text-right">
                <Amount value={r.amount} size="sm" />
                <p className="text-[10.5px] text-muted-foreground">{r.share}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {electricityRow && electricityBilledBack > 0 && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Electricity is <strong className="text-foreground">{electricityRow.share}%</strong> of the spend and{" "}
            <strong className="text-foreground">
              {Math.min(100, Math.round((electricityBilledBack / electricityRow.amount) * 100))}%
            </strong>{" "}
            of it is billed back to rooms. The gap —{" "}
            <strong className="text-ledger">{inr(round2(Math.max(0, electricityRow.amount - electricityBilledBack)))}</strong> — is
            common-area load.
          </p>
        </Panel>
      )}

      <div>
        <SectionHeading>Total, all time</SectionHeading>
        <Amount value={total} size="lg" />
      </div>

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
          Track maid, wifi, repairs, and anything else you spend on the PG, recurring or one-time.
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
    </div>
  );
}
