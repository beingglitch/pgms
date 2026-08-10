import { listExpenses } from "@/app/actions/expenses";
import { ExpensesClient } from "@/components/expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const expenses = await listExpenses();

  return <ExpensesClient expenses={expenses} />;
}
