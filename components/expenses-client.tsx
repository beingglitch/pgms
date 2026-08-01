"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Wallet } from "lucide-react";
import { ExpenseFormDialog } from "@/components/expense-form-dialog";
import { toggleExpenseActive, deleteExpense } from "@/app/actions/expenses";
import { useManager } from "@/lib/manager-context";
import { inr, fmtDate, monthKey } from "@/lib/format";
import { toast } from "sonner";
import type { ExpenseModel } from "@/lib/generated/prisma/models";

export function ExpensesClient({ expenses }: { expenses: ExpenseModel[] }) {
  const router = useRouter();
  const { manager } = useManager();
  const [formOpen, setFormOpen] = useState(false);

  const thisMonth = monthKey(new Date());
  const recurring = expenses.filter((e) => e.frequency !== "ONE_TIME" && e.active);
  const monthlyTotal = recurring
    .filter((e) => e.frequency === "MONTHLY")
    .reduce((s, e) => s + Number(e.amount), 0);
  const oneTimeThisMonth = expenses
    .filter((e) => e.frequency === "ONE_TIME" && monthKey(e.date) === thisMonth)
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
      <div className="mb-3 flex items-center justify-between">
        <p className="text-lg font-semibold">Expenses</p>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Add expense
        </Button>
      </div>

      <div className="mb-4 flex gap-3">
        <Card className="flex-1">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Monthly recurring</p>
            <p className="mt-1 text-2xl font-semibold">{inr(monthlyTotal)}</p>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">One-time this month</p>
            <p className="mt-1 text-2xl font-semibold">{inr(oneTimeThisMonth)}</p>
          </CardContent>
        </Card>
      </div>

      {recurring.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">Active recurring expenses</p>
          <div className="space-y-2">
            {recurring.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border bg-background p-3">
                <div>
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.category} · {e.frequency === "MONTHLY" ? "monthly" : "yearly"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{inr(e.amount)}</span>
                  <button onClick={() => handleToggle(e.id, false)} className="text-xs text-destructive">
                    Stop
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expenses.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">No expenses yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Track maid, wifi, repairs, and anything else you spend on the PG — recurring or one-time.
          </p>
        </div>
      )}

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">All expenses</p>
      <div className="space-y-2">
        {expenses.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg border bg-background p-3">
            <div>
              <p className="text-sm font-semibold">
                {e.title} {!e.active && e.frequency !== "ONE_TIME" && <Badge variant="outline">Stopped</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">
                {e.category} · {fmtDate(e.date)} · {e.frequency === "ONE_TIME" ? "one-time" : e.frequency.toLowerCase()}
              </p>
              {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{inr(e.amount)}</span>
              <button onClick={() => handleDelete(e.id)} className="text-xs text-destructive">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
