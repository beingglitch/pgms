"use server";

import { prisma } from "@/lib/prisma";
import { num, periodOf, round2, summariseCharges } from "@/lib/charges";
import { requireAccountId } from "./auth";

export type PeriodCollections = Map<string, { collected: number; rent: number }>;

/**
 * Money collected, grouped by the billing period it actually paid off - not
 * the date it was paid on. A payment made in August against June and July's
 * rent counts toward June and July here, via each Allocation's Charge.period,
 * the same trail the dues engine itself follows in allocatePaymentToCharges.
 *
 * Only the allocated portion of a payment has a period to attribute to. Any
 * leftover sitting as unapplied credit (paid in advance of any open charge)
 * is counted toward the month it was actually received, since it isn't "for"
 * a billing period yet.
 */
export async function getCollectionsByPeriod(): Promise<PeriodCollections> {
  const accountId = await requireAccountId();
  const [allocations, payments] = await Promise.all([
    prisma.allocation.findMany({
      where: { ledgerEntry: { accountId, type: { in: ["RENT", "OTHER"] } } },
      select: { amount: true, ledgerEntryId: true, charge: { select: { period: true, type: true } } },
    }),
    prisma.ledgerEntry.findMany({
      where: { accountId, type: { in: ["RENT", "OTHER"] } },
      select: { id: true, amount: true, date: true },
    }),
  ]);

  const byPeriod: PeriodCollections = new Map();
  const allocatedPerEntry = new Map<string, number>();

  function bump(period: string, amount: number, isRent: boolean) {
    const row = byPeriod.get(period) ?? { collected: 0, rent: 0 };
    row.collected = round2(row.collected + amount);
    if (isRent) row.rent = round2(row.rent + amount);
    byPeriod.set(period, row);
  }

  for (const a of allocations) {
    const amount = num(a.amount);
    allocatedPerEntry.set(a.ledgerEntryId, round2((allocatedPerEntry.get(a.ledgerEntryId) ?? 0) + amount));
    bump(a.charge.period, amount, a.charge.type === "RENT");
  }

  for (const p of payments) {
    const leftover = round2(num(p.amount) - (allocatedPerEntry.get(p.id) ?? 0));
    if (leftover > 0.005) bump(periodOf(p.date), leftover, false);
  }

  return byPeriod;
}

/** Sum of `Charge.amount` (what was actually billed, waived or not) by period, for the collection-rate chart. */
export async function getBilledByPeriod(): Promise<Map<string, number>> {
  const accountId = await requireAccountId();
  const charges = await prisma.charge.findMany({ where: { accountId }, select: { period: true, amount: true } });
  const byPeriod = new Map<string, number>();
  for (const c of charges) byPeriod.set(c.period, round2((byPeriod.get(c.period) ?? 0) + num(c.amount)));
  return byPeriod;
}

/**
 * Beds occupied at the end of each of the last `months` calendar months,
 * derived from each tenant's joinDate/vacatedDate rather than a stored
 * snapshot - a tenant counts for a month if they'd joined by its last day and
 * hadn't vacated before its first.
 */
export async function getOccupancyHistory(months: number) {
  const accountId = await requireAccountId();
  const tenants = await prisma.tenant.findMany({ where: { accountId }, select: { joinDate: true, vacatedDate: true } });

  const points: { period: string; occupied: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthEnd = new Date();
    monthEnd.setDate(1);
    monthEnd.setMonth(monthEnd.getMonth() - i + 1);
    monthEnd.setDate(0);
    const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);

    const occupied = tenants.filter(
      (t) => t.joinDate <= monthEnd && (!t.vacatedDate || t.vacatedDate >= monthStart)
    ).length;

    points.push({ period: periodOf(monthEnd), occupied });
  }
  return points;
}

/**
 * Every deposit currently held, one row per tenant, for Ledger > Security.
 * Deposits aren't tracked through the Charge/dues engine, so this only ever
 * shows what's actually been given, not anyone still owing one.
 */
export async function listSecurityDeposits() {
  const accountId = await requireAccountId();
  const tenants = await prisma.tenant.findMany({
    where: { accountId, status: "ACTIVE", depositAmount: { gt: 0 } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      joinDate: true,
      depositAmount: true,
      depositMethod: true,
      depositChequeNumber: true,
      depositChequeBank: true,
      roomNumber: true,
      room: { select: { number: true, floor: { select: { name: true } } } },
    },
  });

  return {
    // depositAmount is a Prisma Decimal, not a plain object - it can't cross
    // the Server Component -> Client Component boundary as-is.
    tenants: tenants.map((t) => ({ ...t, depositAmount: num(t.depositAmount) })),
    total: round2(tenants.reduce((s, t) => s + num(t.depositAmount), 0)),
  };
}

/**
 * Deposits are not income. They're money the owner is holding and will hand
 * back, tracked separately from collections so the two never blur together.
 */
export async function getDepositLiability() {
  const accountId = await requireAccountId();
  const [active, notice] = await Promise.all([
    prisma.tenant.findMany({
      where: { accountId, status: "ACTIVE" },
      select: { id: true, name: true, depositAmount: true, depositMethod: true, expectedVacateDate: true },
    }),
    prisma.tenant.findMany({
      where: { accountId, status: "ACTIVE", NOT: { noticeDate: null } },
      orderBy: { expectedVacateDate: "asc" },
      select: {
        id: true,
        name: true,
        depositAmount: true,
        noticeDate: true,
        expectedVacateDate: true,
        room: { select: { number: true, floor: { select: { name: true } } } },
      },
    }),
  ]);

  const held = round2(active.reduce((sum, t) => sum + num(t.depositAmount), 0));

  // A deposit taken as a blank cheque isn't cash in hand, so it's called out.
  const asCheque = round2(
    active.filter((t) => t.depositMethod === "CHEQUE").reduce((sum, t) => sum + num(t.depositAmount), 0)
  );

  return {
    held,
    asCheque,
    inCash: round2(held - asCheque),
    tenantCount: active.length,
    leavingSoon: notice,
    dueBackSoon: round2(notice.reduce((sum, t) => sum + num(t.depositAmount), 0)),
  };
}

/**
 * What a tenant walks away with: deposit, less anything still owed, less
 * whatever is being deducted for damage.
 */
export async function getCheckoutSettlement(tenantId: string) {
  const accountId = await requireAccountId();
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, accountId },
    include: {
      charges: { include: { allocations: { select: { amount: true } } } },
      checkoutDeductions: true,
    },
  });

  if (!tenant) return null;

  const summary = summariseCharges(tenant.charges);
  const deductions = round2(tenant.checkoutDeductions.reduce((sum, d) => sum + num(d.amount), 0));
  const deposit = num(tenant.depositAmount);
  const unpaid = summary.total.outstanding;

  // The room's open reading, if any, plus who else is currently sharing it:
  // what the checkout dialog needs to estimate this tenant's slice of
  // electricity used since the reading opened, live, before anything's
  // actually closed out.
  const openReading = tenant.roomId
    ? await prisma.electricityBill.findFirst({
        where: { roomId: tenant.roomId, accountId, endDate: null },
        select: { id: true, startReading: true, startDate: true, ratePerUnit: true },
      })
    : null;

  const roommates = tenant.roomId
    ? await prisma.tenant.findMany({
        where: { roomId: tenant.roomId, accountId, status: "ACTIVE", id: { not: tenantId } },
        select: { id: true, name: true, joinDate: true },
      })
    : [];

  return {
    deposit,
    unpaidCharges: unpaid,
    deductions,
    refundable: round2(deposit - unpaid - deductions),
    byType: {
      rent: summary.byType.RENT.outstanding,
      electricity: summary.byType.ELECTRICITY.outstanding,
      other: round2(summary.byType.LAUNDRY.outstanding + summary.byType.OTHER.outstanding),
    },
    openCharges: tenant.charges
      .filter((c) => !c.waived)
      .map((c) => ({
        id: c.id,
        type: c.type,
        description: c.description,
        amount: num(c.amount),
        outstanding: round2(num(c.amount) - c.allocations.reduce((s, a) => s + num(a.amount), 0)),
      }))
      .filter((c) => c.outstanding > 0.005),
    existingDeductions: tenant.checkoutDeductions,
    openReading: openReading
      ? {
          id: openReading.id,
          startReading: num(openReading.startReading),
          startDate: openReading.startDate,
          ratePerUnit: num(openReading.ratePerUnit),
        }
      : null,
    roommates,
    tenantJoinDate: tenant.joinDate,
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n");
}

/**
 * Everything in the database as CSV, one file per table.
 *
 * A single-owner app with one hosted database and no export is one bad day
 * away from losing years of records. Scoped to the signed-in account - the
 * highest-risk spot in the app for a cross-account leak if that scoping were
 * ever missed, since it otherwise reads every table with no filter at all.
 */
export async function exportAllData() {
  const accountId = await requireAccountId();
  const [tenants, ledger, charges, allocations, bills, expenses, agreements, rooms, reminders, activity] =
    await Promise.all([
      prisma.tenant.findMany({ where: { accountId }, include: { room: { include: { floor: true } } }, orderBy: { name: "asc" } }),
      prisma.ledgerEntry.findMany({ where: { accountId }, include: { tenant: { select: { name: true } } }, orderBy: { date: "desc" } }),
      prisma.charge.findMany({
        where: { accountId },
        include: { tenant: { select: { name: true } }, allocations: { select: { amount: true } } },
        orderBy: { dueDate: "desc" },
      }),
      prisma.allocation.findMany({
        where: { ledgerEntry: { accountId } },
        include: { charge: { select: { description: true } }, ledgerEntry: { select: { receiptNo: true } } },
      }),
      prisma.electricityBill.findMany({
        where: { accountId },
        include: { room: { select: { number: true } }, tenant: { select: { name: true } } },
        orderBy: { endDate: "desc" },
      }),
      prisma.expense.findMany({ where: { accountId }, orderBy: { date: "desc" } }),
      prisma.agreement.findMany({
        where: { tenant: { accountId } },
        include: { tenant: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.room.findMany({ where: { accountId }, include: { floor: true }, orderBy: { number: "asc" } }),
      prisma.reminder.findMany({ where: { accountId }, include: { tenant: { select: { name: true } } }, orderBy: { dueDate: "desc" } }),
      prisma.activityLog.findMany({ where: { accountId }, orderBy: { ts: "desc" } }),
    ]);

  return {
    "tenants.csv": toCsv(
      tenants.map((t) => ({
        name: t.name,
        phone: t.phone,
        email: t.email,
        status: t.status,
        floor: t.room?.floor.name ?? "",
        room: t.room?.number ?? t.roomNumber ?? "",
        bed: t.bedNumber,
        rent: num(t.rentAmount),
        rentOverride: t.rentOverride ? num(t.rentOverride) : "",
        deposit: num(t.depositAmount),
        depositMethod: t.depositMethod,
        joinDate: t.joinDate,
        noticeDate: t.noticeDate,
        expectedVacateDate: t.expectedVacateDate,
        vacatedDate: t.vacatedDate,
        refundAmount: t.refundAmount ? num(t.refundAmount) : "",
        idProofType: t.idProofType,
        idProofNumber: t.idProofNumber,
        pan: t.pan,
        address: t.address,
        emergencyContact: t.emergencyContact,
        emergencyPhone: t.emergencyPhone,
      }))
    ),
    "payments.csv": toCsv(
      ledger.map((e) => ({
        receiptNo: e.receiptNo,
        date: e.date,
        tenant: e.tenant.name,
        type: e.type,
        amount: num(e.amount),
        mode: e.mode,
        note: e.note,
        recordedBy: e.recordedBy,
      }))
    ),
    "charges.csv": toCsv(
      charges.map((c) => ({
        date: c.dueDate,
        tenant: c.tenant.name,
        type: c.type,
        period: c.period,
        description: c.description,
        amount: num(c.amount),
        paid: round2(c.allocations.reduce((s, a) => s + num(a.amount), 0)),
        outstanding: c.waived ? 0 : round2(num(c.amount) - c.allocations.reduce((s, a) => s + num(a.amount), 0)),
        waived: c.waived,
      }))
    ),
    "payment-allocations.csv": toCsv(
      allocations.map((a) => ({
        receiptNo: a.ledgerEntry.receiptNo,
        charge: a.charge.description,
        amount: num(a.amount),
      }))
    ),
    "electricity.csv": toCsv(
      bills.map((b) => ({
        status: b.endDate ? "closed" : "open",
        startDate: b.startDate,
        // Blank rather than num()'d to 0: an open reading genuinely has no
        // end value yet, which reads very differently from "zero units".
        endDate: b.endDate ?? "",
        meter: b.isMainMeter ? "Main meter" : b.room ? `Room ${b.room.number}` : (b.tenant?.name ?? ""),
        startReading: num(b.startReading),
        endReading: b.endReading !== null ? num(b.endReading) : "",
        units: b.units !== null ? num(b.units) : "",
        ratePerUnit: num(b.ratePerUnit),
        amount: b.amount !== null ? num(b.amount) : "",
      }))
    ),
    "expenses.csv": toCsv(
      expenses.map((e) => ({
        date: e.date,
        title: e.title,
        category: e.category,
        amount: num(e.amount),
        frequency: e.frequency,
        active: e.active,
        note: e.note,
      }))
    ),
    "agreements.csv": toCsv(
      agreements.map((a) => ({
        tenant: a.tenant.name,
        version: a.version,
        effectiveDate: a.effectiveDate,
        rent: num(a.rentAmount),
        deposit: num(a.depositAmount),
        depositRefundable: a.depositRefundable,
        electricityRate: num(a.electricityRate),
        laundryCharge: a.laundryChargeable ? num(a.laundryCharge) : 0,
        changeNote: a.changeNote,
        changedBy: a.changedBy,
      }))
    ),
    "rooms.csv": toCsv(
      rooms.map((r) => ({
        floor: r.floor.name,
        room: r.number,
        beds: r.capacity,
        roomRent: num(r.rentAmount),
      }))
    ),
    "reminders.csv": toCsv(
      reminders.map((r) => ({
        dueDate: r.dueDate,
        tenant: r.tenant?.name ?? "",
        type: r.type,
        title: r.title,
        amount: r.amount ? num(r.amount) : "",
        status: r.status,
      }))
    ),
    "activity-log.csv": toCsv(
      activity.map((a) => ({ timestamp: a.ts, actor: a.actor, action: a.action, detail: a.detail }))
    ),
  };
}
