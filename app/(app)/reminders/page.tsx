import { getReminderHistory, listPendingReminders } from "@/app/actions/reminders";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { listTenants } from "@/app/actions/tenants";
import { getPgInfo } from "@/app/actions/settings";
import { RemindersClient } from "@/components/reminders-client";
import { serialise } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const [dues, history, pgInfo, pendingReminders, tenants] = await Promise.all([
    listOutstandingByTenant(),
    getReminderHistory(),
    getPgInfo(),
    listPendingReminders(),
    listTenants(),
  ]);

  return (
    <RemindersClient
      dues={serialise(dues)}
      history={history}
      paymentLink={pgInfo.paymentLink}
      pendingReminders={serialise(pendingReminders)}
      tenantOptions={tenants.filter((t) => t.status === "ACTIVE").map((t) => ({ id: t.id, name: t.name }))}
      signature={{
        pgName: pgInfo.name,
        ownerName: pgInfo.ownerName,
        contact: pgInfo.contact,
        address: pgInfo.address,
      }}
    />
  );
}
