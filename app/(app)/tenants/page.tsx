import { prisma } from "@/lib/prisma";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { listRoomOptions } from "@/app/actions/rooms";
import { getPgInfo } from "@/app/actions/settings";
import { requireAccountId } from "@/app/actions/auth";
import { num } from "@/lib/charges";
import { TenantsClient } from "@/components/tenants-client";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const accountId = await requireAccountId();
  const [rawTenants, dues, roomOptions, pgInfo] = await Promise.all([
    prisma.tenant.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      include: { room: { select: { number: true, floor: { select: { name: true } } } } },
    }),
    listOutstandingByTenant(),
    listRoomOptions(),
    getPgInfo(),
  ]);

  // Decimal fields aren't plain objects, so they can't cross the Server
  // Component -> Client Component boundary as-is.
  const tenants = rawTenants.map((t) => ({
    ...t,
    rentAmount: num(t.rentAmount),
    rentOverride: t.rentOverride === null ? null : num(t.rentOverride),
    depositAmount: num(t.depositAmount),
    refundAmount: t.refundAmount === null ? null : num(t.refundAmount),
  }));

  const outstandingByTenant = Object.fromEntries(
    dues.map((d) => [
      d.tenant.id,
      { amount: d.summary.total.outstanding, overdue: d.summary.overdue > 0.005 },
    ])
  );

  return (
    <TenantsClient
      tenants={tenants}
      outstandingByTenant={outstandingByTenant}
      roomOptions={roomOptions}
      electricityRatePerUnit={Number(pgInfo.electricityRatePerUnit)}
    />
  );
}
