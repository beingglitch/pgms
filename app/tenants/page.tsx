import { prisma } from "@/lib/prisma";
import { TenantsClient } from "@/components/tenants-client";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
  return <TenantsClient tenants={tenants} />;
}
