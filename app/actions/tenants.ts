"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { chargeOutstanding, planAllocations } from "@/lib/charges";

export type PaymentMethod = "UPI" | "CASH" | "BANK_TRANSFER" | "CHEQUE";

export type TenantInput = {
  name: string;
  phone: string;
  email?: string;
  fatherName?: string;
  motherName?: string;
  roomNumber?: string;
  bedNumber?: string;
  rentAmount: number;
  depositAmount: number;
  depositMethod: PaymentMethod;
  depositChequeNumber?: string;
  depositChequeBank?: string;
  joinDate: string;
  pan?: string;
  idProofType?: string;
  idProofNumber?: string;
  aadhaarFrontUrl?: string;
  aadhaarBackUrl?: string;
  photoUrl?: string;
  carNumber?: string;
  carModel?: string;
  address?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
};

export type AgreementInput = {
  roomNumber?: string;
  rentAmount: number;
  depositAmount: number;
  depositRefundable: boolean;
  electricityRate: number;
  laundryChargeable: boolean;
  laundryCharge: number;
  facilities: { name: string; amount: number }[];
  photoUrl?: string;
  note?: string;
};

export async function listTenants() {
  return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getTenant(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: {
      room: { include: { floor: { select: { name: true } } } },
      agreements: { orderBy: { version: "desc" } },
      ledgerEntries: { orderBy: { date: "desc" } },
      electricityBills: { orderBy: { endDate: "desc" } },
      reminders: { where: { status: "PENDING" }, orderBy: { dueDate: "asc" } },
      checkoutDeductions: true,
      charges: {
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        include: { allocations: { select: { amount: true } } },
      },
    },
  });
}

export async function createTenant(actor: string, input: TenantInput, agreement: AgreementInput) {
  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      fatherName: input.fatherName,
      motherName: input.motherName,
      roomNumber: input.roomNumber,
      bedNumber: input.bedNumber,
      rentAmount: input.rentAmount,
      depositAmount: input.depositAmount,
      depositMethod: input.depositMethod,
      depositChequeNumber: input.depositChequeNumber,
      depositChequeBank: input.depositChequeBank,
      joinDate: new Date(input.joinDate),
      pan: input.pan,
      idProofType: input.idProofType || "Aadhaar",
      idProofNumber: input.idProofNumber,
      aadhaarFrontUrl: input.aadhaarFrontUrl,
      aadhaarBackUrl: input.aadhaarBackUrl,
      photoUrl: input.photoUrl,
      carNumber: input.carNumber,
      carModel: input.carModel,
      address: input.address,
      emergencyContact: input.emergencyContact,
      emergencyPhone: input.emergencyPhone,
      notes: input.notes,
      createdBy: actor,
      agreements: {
        create: {
          version: 1,
          effectiveDate: new Date(input.joinDate),
          roomNumber: agreement.roomNumber,
          rentAmount: agreement.rentAmount,
          depositAmount: agreement.depositAmount,
          depositRefundable: agreement.depositRefundable,
          electricityRate: agreement.electricityRate,
          laundryChargeable: agreement.laundryChargeable,
          laundryCharge: agreement.laundryCharge,
          facilities: agreement.facilities as never,
          photoUrl: agreement.photoUrl,
          note: agreement.note,
          changedBy: actor,
        },
      },
    },
  });
  await logActivity(actor, "Tenant onboarded", `${tenant.name} · Room ${tenant.roomNumber || "-"}`);
  revalidatePath("/tenants");
  revalidatePath("/");
  return tenant;
}

export async function updateTenant(actor: string, id: string, input: Partial<TenantInput>) {
  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...input,
      joinDate: input.joinDate ? new Date(input.joinDate) : undefined,
    },
  });
  await logActivity(actor, "Tenant updated", tenant.name);
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
  return tenant;
}

export async function deleteTenant(actor: string, id: string) {
  const tenant = await prisma.tenant.delete({ where: { id } });
  await logActivity(actor, "Tenant deleted", tenant.name);
  revalidatePath("/tenants");
  revalidatePath("/");
}

export async function reviseAgreement(actor: string, tenantId: string, fields: AgreementInput, changeNote: string) {
  const last = await prisma.agreement.findFirst({ where: { tenantId }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.agreement.create({
      data: {
        tenantId,
        version,
        effectiveDate: new Date(),
        roomNumber: fields.roomNumber,
        rentAmount: fields.rentAmount,
        depositAmount: fields.depositAmount,
        depositRefundable: fields.depositRefundable,
        electricityRate: fields.electricityRate,
        laundryChargeable: fields.laundryChargeable,
        laundryCharge: fields.laundryCharge,
        facilities: fields.facilities as never,
        photoUrl: fields.photoUrl,
        note: fields.note,
        changeNote,
        changedBy: actor,
      },
    }),
    prisma.tenant.update({
      where: { id: tenantId },
      data: {
        roomNumber: fields.roomNumber,
        rentAmount: fields.rentAmount,
        depositAmount: fields.depositAmount,
      },
    }),
  ]);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  await logActivity(actor, "Agreement revised", `${tenant?.name} · v${version} · ${changeNote || "terms updated"}`);
  revalidatePath(`/tenants/${tenantId}`);
}

export type CheckoutDeductionInput = { reason: string; amount: number; category?: string };

/**
 * Record that a tenant is leaving. Their bed still counts as occupied until
 * the checkout itself, but the vacancy and the deposit refund are now visible
 * ahead of time.
 */
export async function giveNotice(
  actor: string,
  tenantId: string,
  input: { noticeDate: string; expectedVacateDate: string }
) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      noticeDate: new Date(input.noticeDate),
      expectedVacateDate: new Date(input.expectedVacateDate),
    },
  });

  await logActivity(actor, "Notice recorded", `${tenant.name} · leaving ${input.expectedVacateDate}`);
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/");
}

export async function cancelNotice(actor: string, tenantId: string) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { noticeDate: null, expectedVacateDate: null },
  });
  await logActivity(actor, "Notice withdrawn", tenant.name);
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/");
}

export async function checkoutTenant(
  actor: string,
  tenantId: string,
  input: {
    checkoutDate: string;
    deductions: CheckoutDeductionInput[];
    refundMethod: PaymentMethod;
    refundChequeNumber?: string;
  }
) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const checkoutDate = new Date(input.checkoutDate);
  const totalDeductions = input.deductions.reduce((s, d) => s + Number(d.amount || 0), 0);

  // Anything still on their account comes out of the deposit first, recorded as
  // a real payment so the charges show settled rather than silently vanishing.
  const openCharges = await prisma.charge.findMany({
    where: { tenantId, waived: false },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: { allocations: { select: { amount: true } } },
  });
  const unpaidCharges = openCharges.reduce((sum, c) => sum + chargeOutstanding(c), 0);

  if (unpaidCharges > 0.005) {
    const settlement = await prisma.ledgerEntry.create({
      data: {
        tenantId,
        type: "OTHER",
        amount: unpaidCharges,
        date: checkoutDate,
        mode: input.refundMethod,
        note: "Outstanding charges settled from security deposit",
        recordedBy: actor,
      },
    });
    const { allocations } = planAllocations(unpaidCharges, openCharges);
    if (allocations.length > 0) {
      await prisma.allocation.createMany({
        data: allocations.map((a) => ({ ...a, ledgerEntryId: settlement.id })),
      });
    }
  }

  const refundAmount = Number(tenant.depositAmount) - unpaidCharges - totalDeductions;

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: "VACATED",
        vacatedDate: checkoutDate,
        refundAmount,
        refundMethod: input.refundMethod,
        refundChequeNumber: input.refundChequeNumber,
        // Free the bed so the room map shows it available again.
        roomId: null,
      },
    }),
    ...(input.deductions.length
      ? [
          prisma.checkoutDeduction.createMany({
            data: input.deductions.map((d) => ({
              tenantId,
              reason: d.reason,
              amount: d.amount,
              category: d.category,
            })),
          }),
        ]
      : []),
    prisma.ledgerEntry.create({
      data: {
        tenantId,
        type: "REFUND",
        amount: refundAmount,
        date: checkoutDate,
        mode: input.refundMethod,
        note: [
          `Deposit ₹${Number(tenant.depositAmount)}`,
          unpaidCharges > 0.005 ? `unpaid charges ₹${unpaidCharges}` : null,
          input.deductions.length > 0
            ? `deductions (${input.deductions.map((d) => `${d.reason}: ${d.amount}`).join(", ")})`
            : null,
        ]
          .filter(Boolean)
          .join(" less "),
        recordedBy: actor,
      },
    }),
  ]);

  await logActivity(
    actor,
    "Tenant checked out",
    `${tenant.name} · ${refundAmount >= 0 ? "refund" : "owed"} ₹${Math.abs(refundAmount)} via ${input.refundMethod}`
  );

  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/rooms");
  revalidatePath("/ledger");
  revalidatePath("/");
  return { refundAmount, totalDeductions, unpaidCharges };
}
