import type { MetadataRoute } from "next";
import { getPgInfo } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const pgInfo = await getPgInfo();

  return {
    name: pgInfo.name,
    short_name: pgInfo.shortName || pgInfo.name,
    description: `Tenant, ledger, and expense management for ${pgInfo.name}`,
    start_url: "/",
    display: "standalone",
    background_color: "#F4EFE3",
    theme_color: "#18181b",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
