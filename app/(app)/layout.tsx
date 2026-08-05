import { ManagerProvider } from "@/lib/manager-context";
import { Nav } from "@/components/nav";
import { getPgInfo } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const pgInfo = await getPgInfo();
  return (
    <ManagerProvider initialOwnerName={pgInfo.ownerName}>
      <Nav pgName={pgInfo.name} shortName={pgInfo.shortName} logoUrl={pgInfo.logoUrl} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pb-12">{children}</main>
    </ManagerProvider>
  );
}
