import { notFound } from "next/navigation";
import { getTenant } from "@/app/actions/tenants";
import { getPgInfo } from "@/app/actions/settings";
import { listRoomOptions } from "@/app/actions/rooms";
import { TenantDetailClient } from "@/components/tenant-detail-client";
import { serialise, type Serialised } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export type SerialisedTenant = Serialised<NonNullable<Awaited<ReturnType<typeof getTenant>>>>;

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, pgInfo, roomOptions] = await Promise.all([getTenant(id), getPgInfo(), listRoomOptions(id)]);
  if (!tenant) notFound();

  return (
    <TenantDetailClient
      tenant={serialise(tenant)}
      paymentLink={pgInfo.paymentLink}
      signature={{
        pgName: pgInfo.name,
        ownerName: pgInfo.ownerName,
        contact: pgInfo.contact,
        address: pgInfo.address,
      }}
      electricityRate={Number(pgInfo.electricityRatePerUnit)}
      roomOptions={roomOptions}
    />
  );
}
