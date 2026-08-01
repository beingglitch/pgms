"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, BellRing, MessageCircle } from "lucide-react";
import { ReminderFormDialog } from "@/components/reminder-form-dialog";
import { SendMessageDialog } from "@/components/send-message-dialog";
import { markReminder, deleteReminder } from "@/app/actions/reminders";
import { useManager } from "@/lib/manager-context";
import { inr, fmtDate, todayISO, initials } from "@/lib/format";
import type { ReminderModel, TenantModel } from "@/lib/generated/prisma/models";

type ReminderWithTenant = ReminderModel & { tenant: Pick<TenantModel, "name" | "photoUrl" | "phone" | "email"> | null };

export function RemindersClient({
  reminders,
  tenants,
  paymentLink,
}: {
  reminders: ReminderWithTenant[];
  tenants: Pick<TenantModel, "id" | "name" | "roomNumber">[];
  paymentLink: string;
}) {
  const router = useRouter();
  const { manager } = useManager();
  const [formOpen, setFormOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [shareTarget, setShareTarget] = useState<ReminderWithTenant | null>(null);
  const today = todayISO();

  const list = reminders.filter((r) => (showDone ? true : r.status === "PENDING"));

  async function handleMark(id: string) {
    await markReminder(manager, id, "DONE");
    router.refresh();
  }
  async function handleDelete(id: string) {
    await deleteReminder(id);
    router.refresh();
  }

  function messageFor(r: ReminderWithTenant) {
    const kind = r.type === "RENT" ? "rent" : r.type === "ELECTRICITY" ? "electricity bill" : "payment";
    return `Hi ${r.tenant?.name || ""}, your ${kind}${r.amount ? ` of ${inr(r.amount)}` : ""} is due on ${fmtDate(r.dueDate)}. Please take care of it at your earliest convenience. Thank you!`;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-lg font-semibold">Reminders</p>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>
      <button onClick={() => setShowDone((s) => !s)} className="mb-3 text-xs font-semibold text-primary">
        {showDone ? "Hide completed" : "Show completed"}
      </button>

      {list.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <BellRing className="h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">All clear</p>
        </div>
      )}

      <div className="space-y-2">
        {list.map((r) => {
          const dateStr = r.dueDate.toISOString().slice(0, 10);
          const late = r.status === "PENDING" && dateStr < today;
          return (
            <div
              key={r.id}
              className={`flex items-start gap-3 rounded-xl border bg-background p-3 ${late ? "border-destructive" : ""}`}
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={r.tenant?.photoUrl ?? undefined} />
                <AvatarFallback>{initials(r.tenant?.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {r.title} — {r.tenant?.name || "Unknown"}{" "}
                  <Badge variant="outline" className="ml-1">{r.type.toLowerCase()}</Badge>
                </p>
                <p className={`text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
                  {r.status === "DONE" ? "Completed" : late ? "Overdue" : "Due"} {fmtDate(r.dueDate)}
                  {r.amount ? ` · ${inr(r.amount)}` : ""}
                </p>
                {r.note && <p className="mt-0.5 text-xs text-muted-foreground">{r.note}</p>}
                <div className="mt-1.5 flex flex-wrap gap-3">
                  <button
                    onClick={() => setShareTarget(r)}
                    className="flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <MessageCircle className="h-3 w-3" /> Send reminder
                  </button>
                  {r.status === "PENDING" && (
                    <button onClick={() => handleMark(r.id)} className="text-xs font-semibold text-amber-700">
                      Mark done
                    </button>
                  )}
                  <button onClick={() => handleDelete(r.id)} className="text-xs font-semibold text-destructive">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ReminderFormDialog open={formOpen} onOpenChange={setFormOpen} tenants={tenants} />
      {shareTarget && (
        <SendMessageDialog
          open={!!shareTarget}
          onOpenChange={(o) => !o && setShareTarget(null)}
          title="Send reminder"
          subject={shareTarget.title}
          message={messageFor(shareTarget)}
          phone={shareTarget.tenant?.phone}
          email={shareTarget.tenant?.email}
          defaultLink={paymentLink}
        />
      )}
    </div>
  );
}
