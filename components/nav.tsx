"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, BookOpen, BellRing, Settings, Wallet, ShieldCheck } from "lucide-react";
import { useManager } from "@/lib/manager-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/ledger", label: "Ledger", icon: BookOpen },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/reminders", label: "Reminders", icon: BellRing },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav({ pgName }: { pgName: string }) {
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
      <div className="flex items-center justify-between bg-primary px-4 py-4 text-primary-foreground sm:px-6">
        <p className="truncate text-lg font-semibold leading-tight">{pgName}</p>
        <button
          onClick={() => {
            setDraft(manager);
            setEditOpen(true);
          }}
          className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {manager}
        </button>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-background sm:sticky sm:top-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your name</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Shown on every ledger entry, reminder, and edit you make — your accountability trail.
          </p>
          <div>
            <Label className="mb-1">Name</Label>
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <Button onClick={save}>Save</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
