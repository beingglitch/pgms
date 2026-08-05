import { getBuilding } from "@/app/actions/rooms";
import { getPgInfo } from "@/app/actions/settings";
import { listTenants } from "@/app/actions/tenants";
import { RoomsClient } from "@/components/rooms-client";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const [building, tenants, pgInfo] = await Promise.all([getBuilding(), listTenants(), getPgInfo()]);

  return (
    <RoomsClient
      building={building}
      electricityRate={Number(pgInfo.electricityRatePerUnit)}
      unassigned={tenants
        .filter((t) => t.status === "ACTIVE" && !t.roomId)
        .map((t) => ({ id: t.id, name: t.name, photoUrl: t.photoUrl }))}
    />
  );
}
