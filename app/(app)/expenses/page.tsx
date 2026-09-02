import { listExpenses } from "@/app/actions/expenses";
import { ExpensesClient } from "@/components/expenses-client";
import { prisma } from "@/lib/prisma";
import { monthKey } from "@/lib/format";
import { num, round2 } from "@/lib/charges";
import { serialise } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const thisMonth = monthKey(new Date());

  const [rawExpenses, electricityCharges] = await Promise.all([
    listExpenses(),
    // What was actually billed back to tenants this month, so the Spend
    // screen can show the gap between that and the electricity expense line
    // (unbilled, common-area load).
    prisma.charge.findMany({ where: { type: "ELECTRICITY", period: thisMonth }, select: { amount: true } }),
  ]);

  const electricityBilledBack = round2(electricityCharges.reduce((s, c) => s + num(c.amount), 0));

  return <ExpensesClient expenses={serialise(rawExpenses)} electricityBilledBack={electricityBilledBack} />;
}
