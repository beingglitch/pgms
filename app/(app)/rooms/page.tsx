import { getBuilding } from "@/app/actions/rooms";
import { listTenants } from "@/app/actions/tenants";
import { getDepositLiability } from "@/app/actions/reports";
import { RoomsClient } from "@/components/rooms-client";
import { serialise } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const [building, tenants, deposits] = await Promise.all([getBuilding(), listTenants(), getDepositLiability()]);

  return (
    <RoomsClient
      building={serialise(building)}
      unassigned={tenants
        .filter((t) => t.status === "ACTIVE" && !t.roomId)
        .map((t) => ({ id: t.id, name: t.name, photoUrl: t.photoUrl }))}
      noticeTenantIds={deposits.leavingSoon.map((t) => t.id)}
    />
  );
}
