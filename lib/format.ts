export function inr(n: number | string | { toString(): string } | null | undefined) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "not set";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "not set";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Calendar dates are resolved in the property's timezone, not the server's.
 * Hosted in UTC, `new Date().toISOString()` reports yesterday until 05:30 IST,
 * which used to flip rent from "due today" to "overdue" overnight.
 */
export const PROPERTY_TIMEZONE = "Asia/Kolkata";

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROPERTY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" for the given instant, in the property's timezone. */
export function dateISO(d: Date | string | number = new Date()) {
  return isoFormatter.format(new Date(d));
}

export function todayISO() {
  return dateISO();
}

export function daysFromNowISO(n: number) {
  return dateISO(Date.now() + n * 86400000);
}

export function monthKey(d: Date | string) {
  return dateISO(d).slice(0, 7);
}

export function addMonths(dateStr: Date | string, n: number) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function nextDueDate(joinDate: Date | string, lastRentDate: Date | string | null) {
  const base = lastRentDate ?? joinDate;
  if (!base) return null;
  return addMonths(base, 1);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  CASH: "cash",
  BANK_TRANSFER: "bank transfer",
  CHEQUE: "cheque",
};

export function paymentMethodLabel(mode: string | null | undefined) {
  return PAYMENT_METHOD_LABELS[mode || ""] || "cash";
}

export function initials(name: string | null | undefined) {
  return (name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
