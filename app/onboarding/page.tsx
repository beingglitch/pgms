import { redirect } from "next/navigation";
import { getPgInfo } from "@/app/actions/settings";
import { getBuilding } from "@/app/actions/rooms";
import { OnboardingClient } from "@/components/onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const pgInfo = await getPgInfo();
  if (pgInfo.onboardingCompletedAt) redirect("/");

  const building = await getBuilding();

  return (
    <OnboardingClient
      pgInfo={{
        name: pgInfo.name,
        address: pgInfo.address,
        latitude: pgInfo.latitude,
        longitude: pgInfo.longitude,
        logoUrl: pgInfo.logoUrl,
        electricityRatePerUnit: Number(pgInfo.electricityRatePerUnit),
        dueSoonDays: pgInfo.dueSoonDays,
        dueLeadDays: pgInfo.dueLeadDays,
        fiscalYearStartMonth: pgInfo.fiscalYearStartMonth,
      }}
      floorCount={building.floors.length}
    />
  );
}
