"use server";

import { prisma } from "@/lib/prisma";
import { num, round2, summariseCharges } from "@/lib/charges";

/**
 * Deposits are not income. They're money the owner is holding and will hand
 * back, tracked separately from collections so the two never blur together.
 */
export async function getDepositLiability() {
  const [active, notice] = await Promise.all([
    prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, depositAmount: true, depositMethod: true, expectedVacateDate: true },
    }),
    prisma.tenant.findMany({
      where: { status: "ACTIVE", NOT: { noticeDate: null } },
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
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
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
        where: { roomId: tenant.roomId, endDate: null },
        select: { id: true, startReading: true, startDate: true, ratePerUnit: true },
      })
    : null;

  const roommates = tenant.roomId
    ? await prisma.tenant.findMany({
        where: { roomId: tenant.roomId, status: "ACTIVE", id: { not: tenantId } },
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
 * away from losing years of records.
 */
export async function exportAllData() {
  const [tenants, ledger, charges, allocations, bills, expenses, agreements, rooms, reminders, activity] =
    await Promise.all([
      prisma.tenant.findMany({ include: { room: { include: { floor: true } } }, orderBy: { name: "asc" } }),
      prisma.ledgerEntry.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { date: "desc" } }),
      prisma.charge.findMany({
        include: { tenant: { select: { name: true } }, allocations: { select: { amount: true } } },
        orderBy: { dueDate: "desc" },
      }),
      prisma.allocation.findMany({ include: { charge: { select: { description: true } }, ledgerEntry: { select: { receiptNo: true } } } }),
      prisma.electricityBill.findMany({
        include: { room: { select: { number: true } }, tenant: { select: { name: true } } },
        orderBy: { endDate: "desc" },
      }),
      prisma.expense.findMany({ orderBy: { date: "desc" } }),
      prisma.agreement.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.room.findMany({ include: { floor: true }, orderBy: { number: "asc" } }),
      prisma.reminder.findMany({ include: { tenant: { select: { name: true } } }, orderBy: { dueDate: "desc" } }),
      prisma.activityLog.findMany({ orderBy: { ts: "desc" } }),
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
