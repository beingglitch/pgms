"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";

export async function listExpenses() {
  return prisma.expense.findMany({ orderBy: { date: "desc" } });
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
  const expense = await prisma.expense.create({
    data: { ...input, date: new Date(input.date), recordedBy: actor },
  });
  await logActivity(actor, "Expense recorded", `${input.title} · ₹${input.amount}`);
  revalidatePath("/expenses");
  revalidatePath("/");
  return expense;
}

export async function toggleExpenseActive(actor: string, id: string, active: boolean) {
  await prisma.expense.update({ where: { id }, data: { active } });
  await logActivity(actor, active ? "Expense reactivated" : "Recurring expense stopped", id);
  revalidatePath("/expenses");
}

export async function deleteExpense(actor: string, id: string) {
  await prisma.expense.delete({ where: { id } });
  await logActivity(actor, "Expense deleted", id);
  revalidatePath("/expenses");
  revalidatePath("/");
}
