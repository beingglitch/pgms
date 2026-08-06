import { prisma } from "@/lib/prisma";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { listRoomOptions } from "@/app/actions/rooms";
import { TenantsClient } from "@/components/tenants-client";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const [tenants, dues, roomOptions] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: { include: { floor: { select: { name: true } } } } },
    }),
    listOutstandingByTenant(),
    listRoomOptions(),
  ]);

  const outstandingByTenant = Object.fromEntries(
    dues.map((d) => [d.tenant.id, { amount: d.summary.total.outstanding, overdue: d.summary.overdue > 0 }])
  );

  return <TenantsClient tenants={tenants} outstandingByTenant={outstandingByTenant} roomOptions={roomOptions} />;
}
