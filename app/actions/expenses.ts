"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireAccountId } from "./auth";

export async function listExpenses() {
  const accountId = await requireAccountId();
  return prisma.expense.findMany({ where: { accountId }, orderBy: { date: "desc" } });
}

export async function addExpense(
  actor: string,
  input: {
    title: string;
    category: string;
    amount: number;
    frequency: "ONE_TIME" | "MONTHLY" | "YEARLY";
    date: string;
    note?: string;
    receiptUrl?: string;
  }
) {
  const accountId = await requireAccountId();
  const expense = await prisma.expense.create({
    data: { ...input, accountId, date: new Date(input.date), recordedBy: actor },
  });
  await logActivity(accountId, actor, "Expense recorded", `${input.title} · ₹${input.amount}`);
  revalidatePath("/expenses");
  revalidatePath("/");
  return expense;
}

export async function toggleExpenseActive(actor: string, id: string, active: boolean) {
  const accountId = await requireAccountId();
  await prisma.expense.findFirstOrThrow({ where: { id, accountId } });
  await prisma.expense.update({ where: { id }, data: { active } });
  await logActivity(accountId, actor, active ? "Expense reactivated" : "Recurring expense stopped", id);
  revalidatePath("/expenses");
}

export async function deleteExpense(actor: string, id: string) {
  const accountId = await requireAccountId();
  await prisma.expense.findFirstOrThrow({ where: { id, accountId } });
  await prisma.expense.delete({ where: { id } });
  await logActivity(accountId, actor, "Expense deleted", id);
  revalidatePath("/expenses");
  revalidatePath("/");
}
