import { listLedger } from "@/app/actions/ledger";
import { prisma } from "@/lib/prisma";
import { LedgerClient } from "@/components/ledger-client";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const [entries, tenants] = await Promise.all([
    listLedger(),
    prisma.tenant.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, roomNumber: true } }),
  ]);
  return <LedgerClient entries={entries} tenants={tenants} />;
}
