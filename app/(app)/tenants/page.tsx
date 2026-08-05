import { prisma } from "@/lib/prisma";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { TenantsClient } from "@/components/tenants-client";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const [tenants, dues] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: { room: { include: { floor: { select: { name: true } } } } },
    }),
    listOutstandingByTenant(),
  ]);

  const outstandingByTenant = Object.fromEntries(
    dues.map((d) => [d.tenant.id, { amount: d.summary.total.outstanding, overdue: d.summary.overdue > 0 }])
  );

  return <TenantsClient tenants={tenants} outstandingByTenant={outstandingByTenant} />;
}
