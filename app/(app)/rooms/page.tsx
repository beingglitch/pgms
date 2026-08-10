import { getBuilding } from "@/app/actions/rooms";
import { listTenants } from "@/app/actions/tenants";
import { RoomsClient } from "@/components/rooms-client";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const [building, tenants] = await Promise.all([getBuilding(), listTenants()]);

  return (
    <RoomsClient
      building={building}
      unassigned={tenants
        .filter((t) => t.status === "ACTIVE" && !t.roomId)
        .map((t) => ({ id: t.id, name: t.name, photoUrl: t.photoUrl }))}
    />
  );
}
