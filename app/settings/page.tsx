import { getPgInfo } from "@/app/actions/settings";
import { listActivity } from "@/app/actions/activity";
import { SettingsClient } from "@/components/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [pgInfo, activity] = await Promise.all([getPgInfo(), listActivity(100)]);
  return <SettingsClient pgInfo={pgInfo} activity={activity} />;
}
