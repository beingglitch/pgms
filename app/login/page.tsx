import { getPgInfo } from "@/app/actions/settings";
import { LoginClient } from "@/components/login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [pgInfo, params] = await Promise.all([getPgInfo(), searchParams]);

  return (
    <LoginClient
      pgName={pgInfo.name}
      shortName={pgInfo.shortName}
      logoUrl={pgInfo.logoUrl}
      needsSetup={pgInfo.passwordHash === ""}
      next={params.next}
    />
  );
}
