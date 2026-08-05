import { listLedger } from "@/app/actions/ledger";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { getPgInfo } from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";
import { LedgerClient } from "@/components/ledger-client";

export const dynamic = "force-dynamic";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [entries, dues, tenants, pgInfo, params] = await Promise.all([
    listLedger(),
    listOutstandingByTenant(),
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, roomNumber: true, rentAmount: true, phone: true, email: true },
    }),
    getPgInfo(),
    searchParams,
  ]);

  return (
    <LedgerClient
      entries={entries}
      dues={dues}
      tenants={tenants}
      initialTab={params.tab === "dues" ? "dues" : "payments"}
      signature={{
        pgName: pgInfo.name,
        ownerName: pgInfo.ownerName,
        contact: pgInfo.contact,
        address: pgInfo.address,
      }}
      paymentLink={pgInfo.paymentLink}
    />
  );
}
