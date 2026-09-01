"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, ChevronRight, Users } from "lucide-react";
import { TenantFormDialog } from "@/components/tenant-form-dialog";
import { ZoomableImage } from "@/components/image-viewer";
import { EmptyState, PageTitle } from "@/components/khata";
import { inr, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TenantModel } from "@/lib/generated/prisma/models";
import type { listRoomOptions } from "@/app/actions/rooms";

type TenantRow = Omit<TenantModel, "rentAmount" | "rentOverride" | "depositAmount" | "refundAmount"> & {
  rentAmount: number;
  rentOverride: number | null;
  depositAmount: number;
  refundAmount: number | null;
  room: { number: string; floor: { name: string } } | null;
};
type RoomOption = Awaited<ReturnType<typeof listRoomOptions>>[number];

const FILTERS = ["owing", "notice", "all", "vacated"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = { all: "All", owing: "Owing", notice: "On notice", vacated: "Vacated" };

export function TenantsClient({
  tenants,
  outstandingByTenant,
  roomOptions,
  electricityRatePerUnit,
}: {
  tenants: TenantRow[];
  outstandingByTenant: Record<string, { amount: number; overdue: boolean }>;
  roomOptions: RoomOption[];
  electricityRatePerUnit: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("owing");
  const [formOpen, setFormOpen] = useState(false);

  function matchesFilter(t: TenantRow) {
    switch (filter) {
      case "all":
        return true;
      case "vacated":
        return t.status === "VACATED";
      case "notice":
        return t.status === "ACTIVE" && !!t.noticeDate;
      case "owing":
        return t.status === "ACTIVE" && (outstandingByTenant[t.id]?.amount ?? 0) > 0.005;
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = tenants
    .filter(matchesFilter)
    .filter((t) => {
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.roomNumber?.toLowerCase().includes(q) ||
        t.room?.number.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const diff = (outstandingByTenant[b.id]?.amount ?? 0) - (outstandingByTenant[a.id]?.amount ?? 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

  const filteredSum = filtered.reduce((s, t) => s + (outstandingByTenant[t.id]?.amount ?? 0), 0);

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

      <div className="mb-3 flex items-center gap-2 rounded-[14px] border border-input bg-background px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, room, or phone"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="mb-3 flex min-w-0 gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "border border-input bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {filtered.length} {FILTER_LABELS[filter].toUpperCase()}
        {filteredSum > 0.005 ? ` · ${inr(filteredSum)}` : ""}
      </p>

      {filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title={tenants.length === 0 ? "No tenants here" : "Nobody matches"}
          action={
            tenants.length === 0 ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Add your first tenant
              </Button>
            ) : undefined
          }
        >
          {tenants.length === 0 ? "Onboard a tenant with their photo, ID, and agreement." : "Try a different filter or search."}
        </EmptyState>
      )}

      <div>
        {filtered.map((t) => {
          const due = outstandingByTenant[t.id];
          const owing = (due?.amount ?? 0) > 0.005;
          const overdue = !!due?.overdue;
          const onNotice = t.status === "ACTIVE" && !!t.noticeDate;
          const roomLabel = t.room ? `Room ${t.room.number}` : t.roomNumber ? `Room ${t.roomNumber}` : "No room";

          let badge: { label: string; className: string } | null = null;
          if (t.status === "VACATED") badge = { label: "Vacated", className: "bg-muted text-muted-foreground" };
          else if (overdue) badge = { label: "Overdue", className: "bg-ledger/10 text-ledger" };
          else if (owing) badge = { label: "Due", className: "bg-marigold/15 text-marigold-foreground" };
          else if (onNotice) badge = { label: "On notice", className: "bg-marigold/15 text-marigold-foreground" };
          else badge = { label: "Clear", className: "bg-secondary text-primary" };

          return (
            <Link
              key={t.id}
              href={`/tenants/${t.id}`}
              className="flex w-full items-center gap-[11px] border-b border-border/70 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
            >
              <div
                className={cn(
                  "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[13px] text-[13px] font-bold overflow-hidden",
                  owing ? "bg-ledger/10 text-ledger" : "bg-secondary text-primary"
                )}
              >
                {t.photoUrl ? (
                  <ZoomableImage
                    src={t.photoUrl}
                    alt={t.name}
                    downloadName={`${t.name}-photo.jpg`}
                    thumbClassName="h-[38px] w-[38px] rounded-[13px] object-cover"
                  />
                ) : (
                  initials(t.name)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[14px] font-bold">{t.name}</p>
                  {badge && (
                    <Badge className={cn("shrink-0 border-transparent text-[10px] font-bold", badge.className)}>
                      {badge.label}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {roomLabel}
                  {t.bedNumber ? ` · bed ${t.bedNumber}` : ""} · {inr(t.rentAmount)}/mo
                </p>
              </div>
              <div className="shrink-0 text-right">
                {owing ? (
                  <p className="khata-amount text-[16px] font-bold text-ledger">{inr(due!.amount)}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">clear</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>

      <TenantFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        roomOptions={roomOptions}
        electricityRatePerUnit={electricityRatePerUnit}
      />
    </div>
  );
}
