import { getPgInfo } from "@/app/actions/settings";
import { num } from "@/lib/charges";
import { SettingsClient } from "@/components/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const raw = await getPgInfo();
  // electricityRatePerUnit is a Prisma Decimal - not a plain object, so it
  // can't cross the Server Component -> Client Component boundary as-is.
  const pgInfo = { ...raw, electricityRatePerUnit: num(raw.electricityRatePerUnit) };
  return <SettingsClient pgInfo={pgInfo} />;
}
