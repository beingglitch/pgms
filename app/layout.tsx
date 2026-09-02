import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ScrollbarActivity } from "@/components/scrollbar-activity";
import { getPgInfo } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const pgInfo = await getPgInfo();
  return {
    title: pgInfo.name,
    description: `Tenant, ledger, and expense management for ${pgInfo.name}`,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: pgInfo.name },
  };
}

export const viewport: Viewport = {
  themeColor: "#FDFBF7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* The body face is on the critical path for every screen. */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/schibsted-latin.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/bricolage-latin.woff2" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-foreground">
        {children}
        <Toaster />
        <ScrollbarActivity />
      </body>
    </html>
  );
}
