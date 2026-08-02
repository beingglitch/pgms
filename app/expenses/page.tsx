import { listExpenses } from "@/app/actions/expenses";
import { listMainMeterReadings } from "@/app/actions/electricity";
import { getPgInfo } from "@/app/actions/settings";
import { ExpensesClient } from "@/components/expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const [expenses, mainMeterReadings, pgInfo] = await Promise.all([
    listExpenses(),
    listMainMeterReadings(),
    getPgInfo(),
  ]);
  return (
    <ExpensesClient
      expenses={expenses}
      mainMeterReadings={mainMeterReadings}
      electricityRate={Number(pgInfo.electricityRatePerUnit)}
    />
  );
}
