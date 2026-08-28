import { listLedger } from "@/app/actions/ledger";
import { listOutstandingByTenant } from "@/app/actions/charges";
import { listExpenses } from "@/app/actions/expenses";
import { listSecurityDeposits } from "@/app/actions/reports";
import { getPgInfo } from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";
import { num } from "@/lib/charges";
import { LedgerClient } from "@/components/ledger-client";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string; month?: string }>;
}) {
  const [entries, expenses, deposits, dues, tenants, pgInfo, params] = await Promise.all([
    listLedger(),
    listExpenses(),
    listSecurityDeposits(),
    listOutstandingByTenant(),
    prisma.tenant
      .findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          photoUrl: true,
          roomNumber: true,
          rentAmount: true,
          phone: true,
          email: true,
          room: { select: { id: true } },
        },
      })
      // rentAmount is a Prisma Decimal - not a plain object, so it can't
      // cross the Server Component -> Client Component boundary as-is.
      .then((rows) => rows.map((t) => ({ ...t, rentAmount: num(t.rentAmount) }))),
    getPgInfo(),
    searchParams,
  ]);

  return (
    <LedgerClient
      entries={entries}
      expenses={expenses}
      deposits={deposits}
      dues={dues}
      tenants={tenants}
      dueSoonDays={pgInfo.dueSoonDays}
      initialTab={
        params.month
          ? "payments"
          : params.tab === "payments"
            ? "payments"
            : params.tab === "security"
              ? "security"
              : "dues"
      }
      initialDuesFilter={params.filter === "upcoming" ? "upcoming" : params.filter === "current" ? "current" : "all"}
      initialMonth={params.month}
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
