import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ManagerProvider } from "@/lib/manager-context";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { getPgInfo } from "@/app/actions/settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pgInfo = await getPgInfo();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-muted/30">
        <ManagerProvider initialOwnerName={pgInfo.ownerName}>
          <Nav pgName={pgInfo.name} shortName={pgInfo.shortName} logoUrl={pgInfo.logoUrl} />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-10">{children}</main>
        </ManagerProvider>
        <Toaster />
      </body>
    </html>
  );
}
