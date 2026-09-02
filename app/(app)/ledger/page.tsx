import { listLedger } from "@/app/actions/ledger";
import { listAllCharges, listOutstandingByTenant } from "@/app/actions/charges";
import { listExpenses } from "@/app/actions/expenses";
import { listSecurityDeposits } from "@/app/actions/reports";
import { getPgInfo } from "@/app/actions/settings";
import { requireAccountId } from "@/app/actions/auth";
import { prisma } from "@/lib/prisma";
import { num } from "@/lib/charges";
import { serialise } from "@/lib/serialize";
import { LedgerClient } from "@/components/ledger-client";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string; month?: string }>;
}) {
  const accountId = await requireAccountId();
  const [entries, rawExpenses, deposits, rawDues, rawCharges, tenants, pgInfo, params] = await Promise.all([
    listLedger(),
    listExpenses(),
    listSecurityDeposits(),
    listOutstandingByTenant(),
    listAllCharges(),
    prisma.tenant
      .findMany({
        where: { accountId, status: "ACTIVE" },
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
      expenses={serialise(rawExpenses)}
      deposits={deposits}
      dues={serialise(rawDues)}
      charges={serialise(rawCharges)}
      tenants={tenants}
      dueSoonDays={pgInfo.dueSoonDays}
      initialTab={
        params.tab === "billed"
          ? "billed"
          : params.tab === "payments"
            ? "payments"
            : params.tab === "security"
              ? "security"
              : params.month
                ? "payments"
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
