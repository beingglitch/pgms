"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireAccountId } from "./auth";

export async function saveOnboardingProperty(
  actor: string,
  data: { name: string; address: string; latitude: number | null; longitude: number | null }
) {
  const accountId = await requireAccountId();
  await prisma.account.update({
    where: { id: accountId },
    data: {
      name: data.name.trim() || "My PG",
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });
  await logActivity(accountId, actor, "Onboarding: property saved", data.name);
}

export async function saveOnboardingBilling(
  actor: string,
  data: {
    logoUrl: string;
    electricityRatePerUnit: number;
    dueSoonDays: number;
    dueLeadDays: number;
    fiscalYearStartMonth: number;
  }
) {
  const accountId = await requireAccountId();
  await prisma.account.update({ where: { id: accountId }, data });
  await logActivity(accountId, actor, "Onboarding: billing saved", "");
}

export async function finishOnboarding(actor: string) {
  const accountId = await requireAccountId();
  await prisma.account.update({ where: { id: accountId }, data: { onboardingCompletedAt: new Date() } });
  await logActivity(accountId, actor, "Onboarding completed", "");
  revalidatePath("/");
  revalidatePath("/onboarding");
}
