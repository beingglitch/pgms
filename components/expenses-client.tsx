"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet } from "lucide-react";
import { ExpenseFormDialog } from "@/components/expense-form-dialog";
import { toggleExpenseActive, deleteExpense } from "@/app/actions/expenses";
import { useManager } from "@/lib/manager-context";
import { Amount, EmptyState, KhataRow, PageTitle, SectionHeading, StatTile } from "@/components/khata";
import { inr, fmtDate, monthKey } from "@/lib/format";
import { round2 } from "@/lib/charges";
import { toast } from "sonner";
import type { ExpenseModel } from "@/lib/generated/prisma/models";

export function ExpensesClient({ expenses }: { expenses: ExpenseModel[] }) {
  const router = useRouter();
  const { manager } = useManager();
  const [formOpen, setFormOpen] = useState(false);

  const thisMonth = monthKey(new Date());
  const recurring = expenses.filter((e) => e.frequency !== "ONE_TIME" && e.active);
  const monthlyTotal = round2(
    recurring.filter((e) => e.frequency === "MONTHLY").reduce((s, e) => s + Number(e.amount), 0) +
      recurring.filter((e) => e.frequency === "YEARLY").reduce((s, e) => s + Number(e.amount) / 12, 0)
  );
  const oneTimeThisMonth = expenses
    .filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === thisMonth)
    .reduce((s, e) => s + Number(e.amount), 0);
  const total = round2(expenses.reduce((s, e) => s + Number(e.amount), 0));

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
        <StatTile label="Total, all time" value={inr(total)} className="col-span-2" />
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
