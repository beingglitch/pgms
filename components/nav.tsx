"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, BookOpen, DoorOpen, Home, LogOut, Settings, Users, Wallet } from "lucide-react";
import { useManager } from "@/lib/manager-context";
import { ZoomableImage } from "@/components/image-viewer";
import { signOut } from "@/app/actions/auth";

/** The five things the owner does daily. Everything else lives in the menu.
 * Each carries its own accent colour, so the active tab reads as "which
 * area" at a glance rather than one repeated brand hue. */
const primaryNav = [
  { href: "/", label: "Home", icon: Home, color: "text-chip-blue-foreground" },
  { href: "/tenants", label: "Tenants", icon: Users, color: "text-chip-purple-foreground" },
  { href: "/ledger", label: "Ledger", icon: BookOpen, color: "text-chip-green-foreground" },
  { href: "/reminders", label: "Remind", icon: BellRing, color: "text-chip-orange-foreground" },
  { href: "/expenses", label: "Spend", icon: Wallet, color: "text-chip-pink-foreground" },
];

export function Nav({ pgName, shortName, logoUrl }: { pgName: string; shortName: string; logoUrl?: string | null }) {
  const pathname = usePathname();
  const { manager } = useManager();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close whenever the route changes, so a link click doesn't leave the menu
  // open underneath the new page. Adjusted during render rather than in an
  // effect, since it's derived from a prop change, not an external system.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  // A plain state-driven dropdown, not a menu library: it just needs to hold
  // plain links reliably on every device, and this is the simplest thing
  // that can't get that wrong.
  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              <ZoomableImage
                src={logoUrl}
                alt={`${pgName} logo`}
                downloadName="logo.png"
                thumbClassName="h-9 w-9 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-xs font-bold text-primary-foreground">
                {shortName || "PG"}
              </span>
            )}
            <span className="truncate font-display text-base font-semibold tracking-tight">{pgName}</span>
          </Link>

          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {(manager || "O").slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-24 truncate">{manager}</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
                <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Signed in as {manager}</p>
                <div className="my-1 h-px bg-border" />
                <Link
                  href="/rooms"
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground sm:hidden"
                >
                  <DoorOpen className="h-4 w-4" /> Rooms and beds
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => signOut()}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="flex justify-around">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                  active ? item.color : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* On wider screens the same destinations sit inline under the header. */}
      <div className="hidden border-b border-border/70 bg-canvas/85 backdrop-blur-md sm:sticky sm:top-[57px] sm:z-30 sm:block">
        <div className="mx-auto flex w-full max-w-5xl gap-1 px-6">
          {[...primaryNav, { href: "/rooms", label: "Rooms", icon: DoorOpen, color: "text-chip-orange-foreground" }].map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? `border-current ${item.color}`
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
