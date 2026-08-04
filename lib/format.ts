export function inr(n: number | string | { toString(): string } | null | undefined) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysFromNowISO(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

export function monthKey(d: Date | string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
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
