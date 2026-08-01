"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, BookOpen } from "lucide-react";
import { LedgerFormDialog } from "@/components/ledger-form-dialog";
import { deleteLedgerEntry } from "@/app/actions/ledger";
import { useManager } from "@/lib/manager-context";
import { inr, fmtDate, monthKey, initials } from "@/lib/format";
import { toast } from "sonner";
import type { LedgerEntryModel, TenantModel } from "@/lib/generated/prisma/models";

type Entry = LedgerEntryModel & { tenant: Pick<TenantModel, "name" | "photoUrl" | "roomNumber"> | null };

export function LedgerClient({
  entries,
  tenants,
}: {
  entries: Entry[];
  tenants: Pick<TenantModel, "id" | "name" | "roomNumber">[];
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [formOpen, setFormOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");

  const months = Array.from(new Set(entries.map((e) => monthKey(e.date)))).sort().reverse();
  const list = entries.filter((e) => monthFilter === "all" || monthKey(e.date) === monthFilter);
  const total = list.reduce((s, e) => s + Number(e.amount), 0);

  async function handleDelete(id: string) {
    await deleteLedgerEntry(manager, id);
    toast.success("Entry deleted");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-lg font-semibold">Rent ledger</p>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> New entry
        </Button>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setMonthFilter("all")}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
            monthFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          All time
        </button>
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setMonthFilter(m)}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
              monthFilter === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-amber-100 p-3 dark:bg-amber-950">
        <span className="text-sm font-semibold">Total in view</span>
        <span className="text-lg font-bold">{inr(total)}</span>
      </div>

      {list.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">No entries</p>
        </div>
      )}

      <div className="space-y-2">
        {list.map((e) => (
          <div key={e.id} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={e.tenant?.photoUrl ?? undefined} />
                  <AvatarFallback>{initials(e.tenant?.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">{e.tenant?.name || "Unknown tenant"}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {e.type.toLowerCase()} · {fmtDate(e.date)} · {e.mode.replace("_", " ")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-primary">{inr(e.amount)}</p>
                <button onClick={() => handleDelete(e.id)} className="text-xs text-destructive">
                  Delete
                </button>
              </div>
            </div>
            {e.note && <p className="mt-1 text-xs text-muted-foreground">{e.note}</p>}
            <p className="mt-1 text-[10px] text-muted-foreground">Recorded by {e.recordedBy}</p>
          </div>
        ))}
      </div>

      <LedgerFormDialog open={formOpen} onOpenChange={setFormOpen} tenants={tenants} />
    </div>
  );
}
