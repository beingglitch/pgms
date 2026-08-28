import { chargeOutstanding, chargePaid, num, periodOf, periodsBetween, round2, type Money } from "@/lib/charges";
import type { ChargeType } from "@/lib/generated/prisma/enums";

/*
 * A tenant's month-by-month statement: what they were charged for, what was
 * provided, and what was paid *for* each month, regardless of when the money
 * came in. Built from the same charges/allocations the dues engine uses, so
 * it always agrees with the outstanding figure everywhere else in the app.
 *
 * Shared by the tenant page's "Month by month" section and the PDF export.
 */

export type StatementChargeInput = {
  id: string;
  type: ChargeType;
  period: string;
  description: string;
  amount: Money;
  dueDate: Date | string;
  waived: boolean;
  allocations: { amount: Money; ledgerEntry?: { date: Date | string; receiptNo: string | null; mode: string } | null }[];
  sourceBill?: {
    startDate: Date | string;
    endDate: Date | string | null;
    startReading: Money;
    endReading: Money | null;
    units: Money | null;
  } | null;
};

export type StatementPaymentInput = {
  id: string;
  type: string;
  amount: Money;
  date: Date | string;
  mode: string;
  receiptNo: string | null;
  note: string | null;
  allocations?: { amount: Money; charge: { period: string; type: ChargeType } }[];
};

export type StatementAgreementInput = {
  electricityRate: Money;
  laundryChargeable: boolean;
  laundryCharge: Money;
  facilities: unknown;
} | null;

export type StatementTenantInput = {
  joinDate: Date | string;
  vacatedDate?: Date | string | null;
  charges: StatementChargeInput[];
  ledgerEntries: StatementPaymentInput[];
  agreements: StatementAgreementInput[];
};

export type StatementLine = {
  id: string;
  type: ChargeType;
  description: string;
  billed: number;
  paid: number;
  outstanding: number;
  waived: boolean;
  dueDate: Date;
  /** Meter numbers behind an electricity line, when the reading is still on file. */
  reading: { from: number; to: number | null; units: number | null; start: Date; end: Date | null } | null;
};

export type StatementPayment = {
  id: string;
  date: Date;
  amount: number;
  mode: string;
  receiptNo: string | null;
  note: string | null;
  /** The part of this payment that went to this month (a payment can span months). */
  appliedHere: number;
};

export type StatementMonth = {
  period: string;
  lines: StatementLine[];
  /** Everything provided this month, as short labels: "Rent", "Electricity (48 units)", "Laundry", "Wi-Fi"... */
  services: string[];
  payments: StatementPayment[];
  billed: number;
  paid: number;
  outstanding: number;
  /** Nothing billed and nothing provided: a month before they moved in, or after they left. */
  empty: boolean;
  status: "clear" | "partial" | "unpaid" | "none";
};

export type Statement = {
  months: StatementMonth[];
  totals: { billed: number; paid: number; outstanding: number };
};

function facilityNames(facilities: unknown): string[] {
  if (!Array.isArray(facilities)) return [];
  return facilities
    .map((f) => (f && typeof f === "object" && "name" in f ? String((f as { name: unknown }).name ?? "") : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the statement, oldest month first, from the join month through the
 * latest month that has anything on it (a charge or a payment), or the
 * current month if that's later. `asOf` only matters for the last month's
 * upper bound.
 */
export function buildStatement(tenant: StatementTenantInput, asOf: Date = new Date()): Statement {
  const agreement = tenant.agreements[0] ?? null;
  const standing = agreement
    ? [
        ...(agreement.laundryChargeable && num(agreement.laundryCharge) > 0 ? ["Laundry"] : []),
        ...facilityNames(agreement.facilities),
      ]
    : [];

  const chargesByPeriod = new Map<string, StatementChargeInput[]>();
  for (const c of tenant.charges) {
    const list = chargesByPeriod.get(c.period) ?? [];
    list.push(c);
    chargesByPeriod.set(c.period, list);
  }

  // A payment belongs to whichever month's charges it settled. Anything it
  // didn't settle (credit sitting on the account) is shown in the month it
  // was actually received.
  const paymentsByPeriod = new Map<string, StatementPayment[]>();
  for (const p of tenant.ledgerEntries) {
    if (p.type !== "RENT" && p.type !== "OTHER") continue;
    const applied = new Map<string, number>();
    for (const a of p.allocations ?? []) {
      applied.set(a.charge.period, round2((applied.get(a.charge.period) ?? 0) + num(a.amount)));
    }
    const allocatedTotal = [...applied.values()].reduce((s, v) => s + v, 0);
    const leftover = round2(num(p.amount) - allocatedTotal);
    if (leftover > 0.005) {
      const own = periodOf(p.date);
      applied.set(own, round2((applied.get(own) ?? 0) + leftover));
    }
    for (const [period, amount] of applied) {
      const list = paymentsByPeriod.get(period) ?? [];
      list.push({
        id: p.id,
        date: new Date(p.date),
        amount: num(p.amount),
        mode: p.mode,
        receiptNo: p.receiptNo,
        note: p.note,
        appliedHere: amount,
      });
      paymentsByPeriod.set(period, list);
    }
  }

  const from = periodOf(new Date(tenant.joinDate));
  const candidates = [periodOf(asOf), ...chargesByPeriod.keys(), ...paymentsByPeriod.keys()];
  if (tenant.vacatedDate) candidates.push(periodOf(new Date(tenant.vacatedDate)));
  const to = candidates.reduce((max, p) => (p > max ? p : max), from);

  const months: StatementMonth[] = periodsBetween(from, to).map((period) => {
    const charges = chargesByPeriod.get(period) ?? [];
    const lines: StatementLine[] = charges.map((c) => ({
      id: c.id,
      type: c.type,
      description: c.description,
      billed: c.waived ? 0 : num(c.amount),
      paid: chargePaid(c),
      outstanding: chargeOutstanding(c),
      waived: c.waived,
      dueDate: new Date(c.dueDate),
      reading: c.sourceBill
        ? {
            from: num(c.sourceBill.startReading),
            to: c.sourceBill.endReading === null ? null : num(c.sourceBill.endReading),
            units: c.sourceBill.units === null ? null : num(c.sourceBill.units),
            start: new Date(c.sourceBill.startDate),
            end: c.sourceBill.endDate ? new Date(c.sourceBill.endDate) : null,
          }
        : null,
    }));

    const services: string[] = [];
    if (lines.some((l) => l.type === "RENT")) services.push("Rent");
    const electricityUnits = lines
      .filter((l) => l.type === "ELECTRICITY")
      .reduce((s, l) => s + (l.reading?.units ?? 0), 0);
    if (lines.some((l) => l.type === "ELECTRICITY")) {
      services.push(electricityUnits > 0 ? `Electricity (${round2(electricityUnits)} units)` : "Electricity");
    }
    if (lines.some((l) => l.type === "LAUNDRY") && !standing.includes("Laundry")) services.push("Laundry");
    // Standing services from the agreement apply every month the tenant is here.
    const lived = lines.length > 0 || (period >= from && (!tenant.vacatedDate || period <= periodOf(new Date(tenant.vacatedDate))));
    if (lived) services.push(...standing.filter((s) => !services.includes(s)));
    for (const l of lines.filter((l) => l.type === "OTHER")) services.push(l.description);

    const payments = (paymentsByPeriod.get(period) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
    const billed = round2(lines.reduce((s, l) => s + l.billed, 0));
    const paid = round2(lines.reduce((s, l) => s + l.paid, 0));
    const outstanding = round2(lines.reduce((s, l) => s + l.outstanding, 0));
    const empty = lines.length === 0 && payments.length === 0;

    const status: StatementMonth["status"] =
      billed <= 0.005 ? "none" : outstanding <= 0.005 ? "clear" : paid > 0.005 ? "partial" : "unpaid";

    return { period, lines, services, payments, billed, paid, outstanding, empty, status };
  });

  return {
    months,
    totals: {
      billed: round2(months.reduce((s, m) => s + m.billed, 0)),
      paid: round2(months.reduce((s, m) => s + m.paid, 0)),
      outstanding: round2(months.reduce((s, m) => s + m.outstanding, 0)),
    },
  };
}
