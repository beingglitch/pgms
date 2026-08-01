"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, ChevronRight, Users } from "lucide-react";
import { TenantFormDialog } from "@/components/tenant-form-dialog";
import { inr, initials } from "@/lib/format";
import type { TenantModel } from "@/lib/generated/prisma/models";

export function TenantsClient({ tenants }: { tenants: TenantModel[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ACTIVE" | "VACATED" | "ALL">("ACTIVE");
  const [formOpen, setFormOpen] = useState(false);

  const filtered = tenants.filter((t) => {
    if (filter !== "ALL" && t.status !== filter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.phone.includes(q) || t.roomNumber?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, room"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        {(["ACTIVE", "VACATED", "ALL"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {f.toLowerCase()}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">No tenants here</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Onboard your first tenant with their photo, Aadhaar, and agreement.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/tenants/${t.id}`}
            className="flex items-center gap-3 rounded-xl border bg-background p-3"
          >
            <Avatar>
              <AvatarImage src={t.photoUrl ?? undefined} />
              <AvatarFallback>{initials(t.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{t.name}</p>
              <p className="text-xs text-muted-foreground">
                Room {t.roomNumber || "—"} · {inr(t.rentAmount)}/mo
              </p>
            </div>
            {t.status === "VACATED" && <Badge variant="destructive">Vacated</Badge>}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <TenantFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
