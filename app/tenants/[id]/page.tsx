import { notFound } from "next/navigation";
import { getTenant } from "@/app/actions/tenants";
import { prisma } from "@/lib/prisma";
import { TenantDetailClient } from "@/components/tenant-detail-client";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, pgInfo] = await Promise.all([
    getTenant(id),
    prisma.pgInfo.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!tenant) notFound();
  return (
    <TenantDetailClient
      tenant={tenant}
      paymentLink={pgInfo?.paymentLink || ""}
      pgName={pgInfo?.name || "your PG"}
      electricityRate={Number(pgInfo?.electricityRatePerUnit ?? 8)}
    />
  );
}
