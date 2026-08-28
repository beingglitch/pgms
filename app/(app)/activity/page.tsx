import { listActivity } from "@/app/actions/activity";
import { ActivityClient } from "@/components/activity-client";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const activity = await listActivity(200);
  return <ActivityClient activity={activity} />;
}
