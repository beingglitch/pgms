import type { MetadataRoute } from "next";

// Browsers fetch this regardless of sign-in state, so - like the root
// layout's metadata - it can't depend on one account's PG name now that
// there can be many. Generic branding; the signed-in app shell shows the
// real property name and logo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My PG",
    short_name: "My PG",
    description: "Tenant, ledger, and expense management",
    start_url: "/",
    display: "standalone",
    background_color: "#F4EFE3",
    theme_color: "#18181b",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
