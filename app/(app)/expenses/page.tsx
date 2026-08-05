import { listExpenses } from "@/app/actions/expenses";
import { getElectricityRecovery } from "@/app/actions/electricity";
import { getPgInfo } from "@/app/actions/settings";
import { ExpensesClient } from "@/components/expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [expenses, recovery, pgInfo] = await Promise.all([listExpenses(), getElectricityRecovery(), getPgInfo()]);

  return <ExpensesClient expenses={expenses} recovery={recovery} electricityRate={Number(pgInfo.electricityRatePerUnit)} />;
}
