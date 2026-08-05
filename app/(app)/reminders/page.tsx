import { getReminderHistory, listReminders } from "@/app/actions/reminders";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { getPgInfo } from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";
import { RemindersClient } from "@/components/reminders-client";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const [reminders, dues, history, tenants, pgInfo] = await Promise.all([
    listReminders(),
    listOutstandingByTenant(),
    getReminderHistory(),
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, roomNumber: true },
    }),
    getPgInfo(),
  ]);

  return (
    <RemindersClient
      reminders={reminders}
      dues={dues}
      history={history}
      tenants={tenants}
      paymentLink={pgInfo.paymentLink}
      signature={{
        pgName: pgInfo.name,
        ownerName: pgInfo.ownerName,
        contact: pgInfo.contact,
        address: pgInfo.address,
      }}
    />
  );
}
