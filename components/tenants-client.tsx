"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, ChevronRight, Users } from "lucide-react";
import { TenantFormDialog } from "@/components/tenant-form-dialog";
import { Amount, EmptyState, PageTitle } from "@/components/khata";
import { inr, initials } from "@/lib/format";
import type { TenantModel } from "@/lib/generated/prisma/models";
import type { listRoomOptions } from "@/app/actions/rooms";

type TenantRow = TenantModel & { room: { number: string; floor: { name: string } } | null };
type RoomOption = Awaited<ReturnType<typeof listRoomOptions>>[number];

export function TenantsClient({
  tenants,
  outstandingByTenant,
  roomOptions,
}: {
  tenants: TenantRow[];
  outstandingByTenant: Record<string, { amount: number; overdue: boolean }>;
  roomOptions: RoomOption[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ACTIVE" | "VACATED" | "ALL">("ACTIVE");
  const [formOpen, setFormOpen] = useState(false);

  const filtered = tenants.filter((t) => {
    if (filter !== "ALL" && t.status !== filter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.phone.includes(q) ||
      t.roomNumber?.toLowerCase().includes(q) ||
      t.room?.number.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageTitle
        action={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Add tenant
          </Button>
        }
      >
        Tenants
      </PageTitle>

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, room"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="mb-4 flex gap-2">
        {(["ACTIVE", "VACATED", "ALL"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
              filter === f ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.toLowerCase()}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title="No tenants here"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Add your first tenant
            </Button>
          }
        >
          Onboard a tenant with their photo, ID, and agreement.
        </EmptyState>
      )}

      <div className="space-y-2">
        {filtered.map((t) => {
          const due = outstandingByTenant[t.id];
          const roomLabel = t.room ? `${t.room.floor.name} · Room ${t.room.number}` : t.roomNumber ? `Room ${t.roomNumber}` : "No room";
          return (
            <Link
              key={t.id}
              href={`/tenants/${t.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/40"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={t.photoUrl ?? undefined} />
                <AvatarFallback>{initials(t.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {roomLabel} · {inr(t.rentAmount)}/mo
                </p>
              </div>
              {due && due.amount > 0.005 ? (
                <Amount value={due.amount} tone="owed" size="sm" />
              ) : t.status === "ACTIVE" ? (
                <span className="text-[11px] font-semibold text-positive">settled</span>
              ) : null}
              {t.status === "VACATED" && <Badge variant="destructive">Vacated</Badge>}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>

      <TenantFormDialog open={formOpen} onOpenChange={setFormOpen} roomOptions={roomOptions} />
    </div>
  );
}
