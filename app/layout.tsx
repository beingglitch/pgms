import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ScrollbarActivity } from "@/components/scrollbar-activity";

export const dynamic = "force-dynamic";

// Generic, account-agnostic metadata: this layout also wraps /login and
// /signup, which render before any account is known, so it can't depend on
// one account's PG name the way it used to when there was only ever one.
// The signed-in app shell (app/(app)/layout.tsx) shows the real property
// name and logo in its own nav once there's a session to read it from.
export const metadata: Metadata = {
  title: "My PG",
  description: "Tenant, ledger, and expense management",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "My PG" },
};

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
