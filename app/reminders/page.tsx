import { listReminders } from "@/app/actions/reminders";
import { prisma } from "@/lib/prisma";
import { RemindersClient } from "@/components/reminders-client";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const [reminders, tenants, pgInfo] = await Promise.all([
    listReminders(),
    prisma.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, roomNumber: true } }),
    prisma.pgInfo.findUnique({ where: { id: "singleton" } }),
  ]);
  return <RemindersClient reminders={reminders} tenants={tenants} paymentLink={pgInfo?.paymentLink || ""} />;
}
