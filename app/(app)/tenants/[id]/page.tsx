import { notFound } from "next/navigation";
import { getTenant } from "@/app/actions/tenants";
import { getPgInfo } from "@/app/actions/settings";
import { TenantDetailClient } from "@/components/tenant-detail-client";

export const dynamic = "force-dynamic";

type DecimalLike = { toFixed(digits?: number): string; toNumber(): number };

/** The same shape with every Prisma Decimal replaced by a plain number. */
export type Serialised<T> = T extends DecimalLike
  ? number
  : T extends Date
    ? T
    : T extends (infer U)[]
      ? Serialised<U>[]
      : T extends object
        ? { [K in keyof T]: Serialised<T[K]> }
        : T;

/**
 * Prisma's Decimal isn't a plain object, so it can't cross the Server
 * Component -> Client Component boundary. Everything numeric on the tenant
 * (rent, deposit, charge amounts, allocations, meter readings, agreement
 * rates) is converted here, once, before the page hands it to the client.
 */
function serialise<T>(value: T): Serialised<T> {
  if (value === null || value === undefined) return value as Serialised<T>;
  if (value instanceof Date) return value as Serialised<T>;
  if (Array.isArray(value)) return value.map((v) => serialise(v)) as Serialised<T>;
  if (typeof value === "object") {
    const maybeDecimal = value as Partial<DecimalLike>;
    if (typeof maybeDecimal.toFixed === "function" && typeof maybeDecimal.toNumber === "function") {
      return maybeDecimal.toNumber() as Serialised<T>;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialise(v);
    return out as Serialised<T>;
  }
  return value as Serialised<T>;
}

export type SerialisedTenant = Serialised<NonNullable<Awaited<ReturnType<typeof getTenant>>>>;

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, pgInfo] = await Promise.all([getTenant(id), getPgInfo()]);
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
    />
  );
}
