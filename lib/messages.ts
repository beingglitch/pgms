import { inr, fmtDate } from "@/lib/format";
import { chargeOutstanding, round2, type ChargeLike } from "@/lib/charges";
import type { ChargeType } from "@/lib/generated/prisma/enums";

export type Signature = {
  pgName: string;
  ownerName: string;
  contact?: string | null;
  address?: string | null;
};

/**
 * WhatsApp and email both carry plain text, so a logo can't travel with the
 * message. The sign-off is the branding that survives, and it goes on every
 * outgoing message so tenants recognise who is writing.
 */
function signOff({ pgName, ownerName, contact }: Signature) {
  return ["", `${ownerName}, ${pgName}`, contact ? `Contact: ${contact}` : null].filter((l) => l !== null).join("\n");
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
    `${signature.pgName.toUpperCase()}: PAYMENT RECEIPT`,
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
      lines.push(`• ${item.description}: ${inr(item.amount)}`);
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
 * Only the unpaid part of each charge appears. A tenant who has paid half
 * their rent is asked for the remaining half, not the original amount. Rent
 * and electricity are each folded into a single line; anything else (a
 * laundry charge, a late fee, a one-off extra) is listed by its own
 * description, since those vary from tenant to tenant.
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
      `Hi ${tenant.name}, your account at ${signature.pgName} is fully settled as on ${fmtDate(asOf)}. Nothing pending, thank you!`,
      "",
      signature.pgName,
    ].join("\n");
  }

  const rent = round2(open.filter((r) => r.charge.type === "RENT").reduce((s, r) => s + r.outstanding, 0));
  const electricity = round2(open.filter((r) => r.charge.type === "ELECTRICITY").reduce((s, r) => s + r.outstanding, 0));
  const extras = open.filter((r) => r.charge.type === "LAUNDRY" || r.charge.type === "OTHER");
  const total = round2(open.reduce((sum, row) => sum + row.outstanding, 0));

  const earliest = open
    .map((row) => new Date(row.charge.dueDate))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  // "rent" or "electricity" when that's the whole story, "charges" once it's
  // a mix, so the opening line reads the way an owner would actually say it.
  const kinds = new Set(open.map((r) => r.charge.type));
  const subject =
    kinds.size === 1 && kinds.has("RENT")
      ? "rent"
      : kinds.size === 1 && kinds.has("ELECTRICITY")
        ? "electricity"
        : "charges";

  const lines: string[] = [
    `Hi ${tenant.name}, a quick reminder about ${subject} of ${inr(total)} due on ${fmtDate(earliest)}`,
  ];

  if (rent > 0) lines.push(`rent: ${inr(rent)}`);
  if (electricity > 0) lines.push(`electricity: ${inr(electricity)}`);
  for (const row of extras) lines.push(`${row.charge.description}: ${inr(row.outstanding)}`);

  lines.push("", `total: ${inr(total)}`, "", signature.pgName);
  return lines.join("\n");
}
