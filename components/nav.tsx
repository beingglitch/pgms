"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, BookOpen, DoorOpen, Home, LogOut, Settings, Users, Wallet } from "lucide-react";
import { useManager } from "@/lib/manager-context";
import { signOut } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** The five things the owner does daily. Everything else lives in the menu. */
const primaryNav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/ledger", label: "Ledger", icon: BookOpen },
  { href: "/reminders", label: "Remind", icon: BellRing },
  { href: "/expenses", label: "Spend", icon: Wallet },
];

export function Nav({ pgName, shortName, logoUrl }: { pgName: string; shortName: string; logoUrl?: string | null }) {
  const pathname = usePathname();
  const { manager, setManager } = useManager();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(manager);

  function save() {
    setManager(draft);
    setEditOpen(false);
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-xs font-bold text-primary-foreground">
                {shortName || "PG"}
              </span>
            )}
            <span className="truncate font-display text-base font-semibold tracking-tight">{pgName}</span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {(manager || "O").slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-24 truncate">{manager}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Signed in as {manager}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/rooms" />}>
                <DoorOpen className="h-4 w-4" /> Rooms &amp; beds
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <Settings className="h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setDraft(manager);
                  setEditOpen(true);
                }}
              >
                <Users className="h-4 w-4" /> Change your name
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                  active ? "text-primary" : "text-muted-foreground"
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
          {[...primaryNav, { href: "/rooms", label: "Rooms", icon: DoorOpen }].map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-primary text-primary"
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your name</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Shown on every ledger entry, reminder, and edit you make — your accountability trail.
          </p>
          <div>
            <Label className="mb-1.5">Name</Label>
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <Button onClick={save}>Save name</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
