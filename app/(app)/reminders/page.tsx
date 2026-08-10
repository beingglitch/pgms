import { getReminderHistory } from "@/app/actions/reminders";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { getPgInfo } from "@/app/actions/settings";
import { RemindersClient } from "@/components/reminders-client";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const [dues, history, pgInfo] = await Promise.all([
    listOutstandingByTenant(),
    getReminderHistory(),
    getPgInfo(),
  ]);

  return (
    <RemindersClient
      dues={dues}
      history={history}
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
