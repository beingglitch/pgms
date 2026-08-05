import { inr, fmtDate } from "@/lib/format";
import { CHARGE_TYPE_LABELS, chargeOutstanding, num, type ChargeLike } from "@/lib/charges";
import type { ChargeType } from "@/lib/generated/prisma/enums";

export type Signature = {
  pgName: string;
  ownerName: string;
  contact?: string | null;
  address?: string | null;
};

/**
 * WhatsApp and email both carry plain text, so a logo can't travel with the
 * message — the sign-off is the branding that survives. It goes on every
 * outgoing message so tenants recognise who is writing.
 */
function signOff({ pgName, ownerName, contact }: Signature) {
  return ["", `— ${ownerName}, ${pgName}`, contact ? `Contact: ${contact}` : null].filter((l) => l !== null).join("\n");
}

export type ReceiptData = {
  receiptNo: string | null;
  tenantName: string;
  roomLabel?: string | null;
  amount: number;
  date: Date | string;
  mode: string;
  appliedTo: { description: string; amount: number }[];
  outstandingAfter: number;
};

export function buildReceiptMessage(receipt: ReceiptData, signature: Signature) {
  const lines: (string | null)[] = [
    `${signature.pgName.toUpperCase()} — PAYMENT RECEIPT`,
    receipt.receiptNo ? `Receipt no: ${receipt.receiptNo}` : null,
    "",
    `Received from: ${receipt.tenantName}${receipt.roomLabel ? ` (${receipt.roomLabel})` : ""}`,
    `Date: ${fmtDate(receipt.date)}`,
    `Amount: ${inr(receipt.amount)}`,
    `Paid by: ${receipt.mode.replace("_", " ").toLowerCase()}`,
  ];

  if (receipt.appliedTo.length > 0) {
    lines.push("", "Adjusted against:");
    for (const item of receipt.appliedTo) {
      lines.push(`• ${item.description} — ${inr(item.amount)}`);
    }
  }

  lines.push(
    "",
    receipt.outstandingAfter > 0.005
      ? `Still pending after this payment: ${inr(receipt.outstandingAfter)}`
      : "Your account is fully settled. Thank you!"
  );

  lines.push(signOff(signature));
  return lines.filter((l) => l !== null).join("\n");
}

export type DuesCharge = ChargeLike & { type: ChargeType; description: string; dueDate: Date | string };

/**
 * An itemised statement of what's still owed.
 *
 * Only the unpaid part of each charge appears — a tenant who has paid half
 * their rent is asked for the remaining half, not the original amount.
 */
export function buildDuesMessage(
  tenant: { name: string; roomLabel?: string | null },
  charges: DuesCharge[],
  signature: Signature,
  asOf: Date = new Date()
) {
  const open = charges
    .map((c) => ({ charge: c, outstanding: chargeOutstanding(c) }))
    .filter((row) => row.outstanding > 0.005);

  if (open.length === 0) {
    return [
      `Hi ${tenant.name}, your account at ${signature.pgName} is fully settled as on ${fmtDate(asOf)}. Nothing pending — thank you!`,
      signOff(signature),
    ].join("\n");
  }

  const total = open.reduce((sum, row) => sum + row.outstanding, 0);
  const partPaid = open.filter((row) => num(row.charge.amount) > row.outstanding);

  const lines: (string | null)[] = [
    `Hi ${tenant.name}, here's what's pending at ${signature.pgName} as on ${fmtDate(asOf)}:`,
    "",
  ];

  // Grouped by type so rent, electricity and extras read as separate sections.
  const order: ChargeType[] = ["RENT", "ELECTRICITY", "LAUNDRY", "OTHER"];
  for (const type of order) {
    const rows = open.filter((row) => row.charge.type === type);
    if (rows.length === 0) continue;

    lines.push(`${CHARGE_TYPE_LABELS[type]}:`);
    for (const row of rows) {
      lines.push(`  • ${row.charge.description} — ${inr(row.outstanding)}`);
    }
  }

  lines.push("", `Total pending: ${inr(total)}`);

  if (partPaid.length > 0) {
    const alreadyPaid = partPaid.reduce((sum, row) => sum + (num(row.charge.amount) - row.outstanding), 0);
    lines.push(`(${inr(alreadyPaid)} already received and adjusted above.)`);
  }

  const earliest = open
    .map((row) => new Date(row.charge.dueDate))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (earliest && earliest < asOf) {
    lines.push("", `This was due on ${fmtDate(earliest)}. Please clear it at your earliest.`);
  } else if (earliest) {
    lines.push("", `Due by ${fmtDate(earliest)}.`);
  }

  lines.push(signOff(signature));
  return lines.filter((l) => l !== null).join("\n");
}
