import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { inr, fmtDate, monthKey, todayISO, daysFromNowISO, nextDueDate, initials } from "@/lib/format";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${tone || ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [tenants, ledger, pgInfo, expenses] = await Promise.all([
    prisma.tenant.findMany({ include: { ledgerEntries: { where: { type: "RENT" }, orderBy: { date: "desc" }, take: 1 } } }),
    prisma.ledgerEntry.findMany({ orderBy: { date: "desc" }, take: 6, include: { tenant: { select: { name: true, photoUrl: true } } } }),
    prisma.pgInfo.findUnique({ where: { id: "singleton" } }),
    prisma.expense.findMany({ where: { active: true } }),
  ]);

  const activeTenants = tenants.filter((t) => t.status === "ACTIVE");
  const thisMonth = monthKey(new Date());
  const collected = ledger
    .filter((e) => e.type === "RENT" && monthKey(e.date) === thisMonth)
    .reduce((s, e) => s + Number(e.amount), 0);

  const today = todayISO();
  const in7 = daysFromNowISO(7);

  const dueSoon = activeTenants
    .map((t) => {
      const due = nextDueDate(t.joinDate, t.ledgerEntries[0]?.date ?? null);
      return { tenant: t, dueDate: due };
    })
    .filter((x): x is { tenant: (typeof activeTenants)[number]; dueDate: Date } => {
      if (!x.dueDate) return false;
      return x.dueDate.toISOString().slice(0, 10) <= in7;
    });

  const overdueCount = dueSoon.filter((x) => x.dueDate.toISOString().slice(0, 10) < today).length;

  const monthlyExpenseTotal = expenses
    .filter((e) => e.frequency === "MONTHLY")
    .reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Stat label="Occupied beds" value={`${activeTenants.length} / ${pgInfo?.totalBeds || "–"}`} />
        <Stat label="Collected this month" value={inr(collected)} tone="text-primary" />
      </div>
      <div className="flex gap-3">
        <Stat label="Due in 7 days" value={dueSoon.length} />
        <Stat label="Overdue" value={overdueCount} tone={overdueCount ? "text-destructive" : ""} />
      </div>
      <div className="flex gap-3">
        <Stat label="Monthly recurring expenses" value={inr(monthlyExpenseTotal)} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Tenants with rent due</p>
            <Link href="/reminders" className="flex items-center gap-1 text-xs font-semibold text-primary">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {dueSoon.length === 0 && <p className="text-sm text-muted-foreground">Nothing due in the next week.</p>}
          {dueSoon.slice(0, 4).map(({ tenant, dueDate }) => {
            const dateStr = dueDate.toISOString().slice(0, 10);
            const late = dateStr < today;
            return (
              <div key={tenant.id} className="flex items-center justify-between border-t py-2 first:border-t-0">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={tenant.photoUrl ?? undefined} />
                    <AvatarFallback>{initials(tenant.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{tenant.name}</p>
                    <p className={`text-xs ${late ? "text-destructive" : "text-muted-foreground"}`}>
                      {late ? "Overdue" : "Due"} {fmtDate(dueDate)}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold">{inr(tenant.rentAmount)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Recent ledger entries</p>
            <Link href="/ledger" className="flex items-center gap-1 text-xs font-semibold text-primary">
              Full ledger <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {ledger.length === 0 && <p className="text-sm text-muted-foreground">No transactions recorded yet.</p>}
          {ledger.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-t py-2 first:border-t-0">
              <div>
                <p className="text-sm font-medium">
                  {e.tenant?.name || "Unknown"} <span className="font-normal text-muted-foreground">· {e.type.toLowerCase()}</span>
                </p>
                <p className="text-xs text-muted-foreground">{fmtDate(e.date)} · {e.mode.replace("_", " ")}</p>
              </div>
              <span className="text-sm font-semibold text-primary">{inr(e.amount)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
