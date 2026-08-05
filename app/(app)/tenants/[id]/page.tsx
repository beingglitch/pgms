import { notFound } from "next/navigation";
import { getTenant } from "@/app/actions/tenants";
import { getPgInfo } from "@/app/actions/settings";
import { TenantDetailClient } from "@/components/tenant-detail-client";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, pgInfo] = await Promise.all([getTenant(id), getPgInfo()]);
  if (!tenant) notFound();

  return (
    <TenantDetailClient
      tenant={tenant}
      paymentLink={pgInfo.paymentLink}
      signature={{
        pgName: pgInfo.name,
        ownerName: pgInfo.ownerName,
        contact: pgInfo.contact,
        address: pgInfo.address,
      }}
      electricityRate={Number(pgInfo.electricityRatePerUnit)}
    />
  );
}
