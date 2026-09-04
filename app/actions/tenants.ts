"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logActivity } from "./activity";
import { requireAccountId } from "./auth";
import { chargeOutstanding, FULL_ROOM_BED, planAllocations } from "@/lib/charges";
import { generateDueRentCharges } from "./charges";
import {
  closeElectricityReading,
  getOpenReadingForRoom,
  resetElectricityIfRoomEmpty,
  startElectricityReading,
} from "./electricity";
import { addLedgerEntry } from "./ledger";

export type PaymentMethod = "UPI" | "CASH" | "BANK_TRANSFER" | "CHEQUE";

export type TenantInput = {
  name: string;
  phone: string;
  email?: string;
  fatherName?: string;
  motherName?: string;
  roomNumber?: string;
  bedNumber?: string;
  /** Set at onboarding only: assigns the bed and bills the room's split from charge one. */
  roomId?: string;
  /** Starting meter reading + proof photo, captured at onboarding if the room has no reading yet. */
  meterStartReading?: number;
  meterStartPhotoUrl?: string;
  /**
   * What the tenant actually handed over on move-in day, settled against
   * their first rent charge immediately. Anything short of the full month
   * stays on the books as a normal due, same as any other partial payment.
   */
  advancePayment?: number;
  /**
   * Per-period ("YYYY-MM") overrides for the rent charges about to be
   * generated - the calculation stays the same, but the owner can round a
   * pro-rated first month up (or down) to whatever was actually agreed
   * before the charge is even created.
   */
  rentOverrides?: Record<string, number>;
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
  const accountId = await requireAccountId();
  return prisma.tenant.findMany({ where: { accountId }, orderBy: { createdAt: "desc" } });
}

export async function getTenant(id: string) {
  const accountId = await requireAccountId();
  return prisma.tenant.findFirst({
    where: { id, accountId },
    include: {
      room: { include: { floor: { select: { name: true } } } },
      agreements: { orderBy: { version: "desc" } },
      ledgerEntries: {
        orderBy: { date: "desc" },
        include: { allocations: { select: { amount: true, charge: { select: { period: true, type: true } } } } },
      },
      // Readings the tenant was ever party to: their own legacy ones, plus
      // every reading of the room they're in (including ones closed before
      // they arrived, which is what makes "the first tenant's reading doesn't
      // disappear when the second moves in" visible on both their pages).
      electricityBills: { orderBy: { startDate: "desc" } },
      reminders: { where: { status: "PENDING" }, orderBy: { dueDate: "asc" } },
      checkoutDeductions: true,
      charges: {
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        include: {
          allocations: {
            select: { amount: true, ledgerEntry: { select: { id: true, date: true, receiptNo: true, mode: true } } },
          },
          sourceBill: {
            select: { id: true, startDate: true, endDate: true, startReading: true, endReading: true, units: true, photoUrl: true },
          },
        },
      },
    },
  });
}

export async function createTenant(actor: string, input: TenantInput, agreement: AgreementInput) {
  const accountId = await requireAccountId();
  const room = input.roomId
    ? await prisma.room.findFirst({
        where: { id: input.roomId, accountId },
        include: { tenants: { where: { status: "ACTIVE" }, select: { id: true } } },
      })
    : null;
  if (input.roomId && !room) throw new Error("Room not found.");

  if (room && input.bedNumber === FULL_ROOM_BED && room.tenants.length > 0) {
    throw new Error("Someone's already in this room, so it can't be given out whole.");
  }

  // A room that's already occupied has a meter reading in progress for the
  // people in it. The newcomer's number closes that reading *before* they
  // exist, so its electricity (from wherever it started up to today) is
  // billed only to whoever was actually here, and a fresh reading opens
  // from today with the newcomer's photo. The closed reading stays on
  // record; nothing about the earlier occupant's history is lost.
  let readingClosedForNewcomer = false;
  if (room && room.tenants.length > 0 && input.meterStartReading !== undefined) {
    const open = await getOpenReadingForRoom(room.id);
    if (open && new Date(open.startDate) <= new Date(input.joinDate)) {
      const closed = await closeElectricityReading(actor, open.id, input.meterStartReading, input.joinDate);
      readingClosedForNewcomer = closed !== null;
    }
  }

  const tenant = await prisma.tenant.create({
    data: {
      accountId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      fatherName: input.fatherName,
      motherName: input.motherName,
      roomId: input.roomId,
      roomNumber: room?.number ?? input.roomNumber,
      bedNumber: input.bedNumber,
      // Whatever was actually agreed at onboarding - the picker fills this
      // in with the room's per-bed share (or full amount) as a starting
      // suggestion, but it's editable before submit and that's what's
      // billed, not a live recompute from the room.
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
  await logActivity(accountId, actor, "Tenant onboarded", `${tenant.name} · Room ${tenant.roomNumber || "-"}`);

  if (input.roomId && input.meterStartReading !== undefined) {
    if (readingClosedForNewcomer) {
      // Closing the previous reading already opened the next one, seeded
      // from the newcomer's number on their join date; it just lacks the
      // proof photo they captured (and should carry their agreed rate).
      const fresh = await getOpenReadingForRoom(input.roomId);
      if (fresh) {
        await prisma.electricityBill.update({
          where: { id: fresh.id },
          data: { photoUrl: input.meterStartPhotoUrl, ratePerUnit: agreement.electricityRate, recordedBy: actor },
        });
      }
    } else {
      await startElectricityReading(actor, {
        roomId: input.roomId,
        startReading: input.meterStartReading,
        startDate: input.joinDate,
        ratePerUnit: agreement.electricityRate,
        photoUrl: input.meterStartPhotoUrl,
      });
    }
  }

  // Rent for everyone, not just the newcomer: every month from each active
  // tenant's join month up to the lead window lands on the books right now.
  // For someone entered today but living here since April, that's April
  // (pro-rated), May, June, ... each as its own charge to settle one by one.
  await generateDueRentCharges(accountId, actor, { revalidate: false });

  // Round a pro-rated (or any other) month up or down to what was actually
  // agreed, right after it's created and before anything's paid against it -
  // adjustChargeAmount's paid-amount guard doesn't apply yet, so a plain
  // update is enough.
  if (input.rentOverrides) {
    for (const [period, amount] of Object.entries(input.rentOverrides)) {
      await prisma.charge.updateMany({
        where: { tenantId: tenant.id, accountId, type: "RENT", period },
        data: { amount },
      });
    }
  }

  if (input.advancePayment && input.advancePayment > 0) {
    await addLedgerEntry(actor, {
      tenantId: tenant.id,
      type: "RENT",
      amount: input.advancePayment,
      date: input.joinDate,
      mode: input.depositMethod,
      note: "Advance payment at joining",
    });
  }

  if (input.depositAmount > 0) {
    await addLedgerEntry(actor, {
      tenantId: tenant.id,
      type: "DEPOSIT",
      amount: input.depositAmount,
      date: input.joinDate,
      mode: input.depositMethod,
      note:
        input.depositMethod === "CHEQUE" && input.depositChequeNumber
          ? `Security deposit · cheque #${input.depositChequeNumber}${input.depositChequeBank ? ` · ${input.depositChequeBank}` : ""}`
          : "Security deposit at joining",
    });
  }

  revalidatePath("/tenants");
  revalidatePath("/ledger");
  if (input.roomId) revalidatePath("/rooms");
  revalidatePath("/");
  return tenant;
}

/**
 * Room/bed are never edited here directly - they're a mirror of the real
 * `roomId` relation, so drifting them from a plain text edit (e.g. "102" ->
 * "103" without actually moving anyone) used to silently desync the tenant
 * from their real room. Any room/bed change must go through
 * `assignTenantToRoom`, which keeps the relation, rent, and the old room's
 * electricity state moving together.
 */
export async function updateTenant(actor: string, id: string, input: Partial<TenantInput>) {
  const accountId = await requireAccountId();
  const existing = await prisma.tenant.findFirst({ where: { id, accountId }, select: { roomId: true } });
  if (!existing) throw new Error("Tenant not found.");
  // roomId is onboarding-only (createTenant); room moves for an existing
  // tenant always go through assignTenantToRoom, never a plain field patch.
  const { roomNumber, bedNumber, ...rest } = input;
  delete rest.roomId;
  const data: Partial<TenantInput> = { ...rest };
  if (!existing.roomId) {
    if (roomNumber !== undefined) data.roomNumber = roomNumber;
    if (bedNumber !== undefined) data.bedNumber = bedNumber;
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...data,
      joinDate: input.joinDate ? new Date(input.joinDate) : undefined,
    },
  });
  await logActivity(accountId, actor, "Tenant updated", tenant.name);
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
  return tenant;
}

/** Replace or remove (url = null) one of a tenant's photos from the image viewer. */
export async function setTenantImage(
  actor: string,
  id: string,
  field: "photoUrl" | "aadhaarFrontUrl" | "aadhaarBackUrl",
  url: string | null
) {
  const accountId = await requireAccountId();
  await prisma.tenant.findFirstOrThrow({ where: { id, accountId } });
  const tenant = await prisma.tenant.update({ where: { id }, data: { [field]: url } });
  const label = field === "photoUrl" ? "photo" : field === "aadhaarFrontUrl" ? "ID front" : "ID back";
  await logActivity(accountId, actor, url ? "Tenant photo changed" : "Tenant photo removed", `${tenant.name} · ${label}`);
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
  revalidatePath("/rooms");
  revalidatePath("/");
}

export async function deleteTenant(actor: string, id: string) {
  const accountId = await requireAccountId();
  await prisma.tenant.findFirstOrThrow({ where: { id, accountId } });
  const tenant = await prisma.tenant.delete({ where: { id } });
  await logActivity(accountId, actor, "Tenant deleted", tenant.name);
  if (tenant.roomId) await resetElectricityIfRoomEmpty(actor, tenant.roomId);
  revalidatePath("/tenants");
  revalidatePath("/rooms");
  revalidatePath("/");
}

/**
 * Updates a tenant's terms in place, no new dated version: there's exactly
 * one agreement per tenant, and editing it (electricity rate, facilities,
 * whatever) from the tenant's own Edit details form just changes that one
 * record, the same way any other field on the tenant does.
 */
export async function updateAgreementFields(actor: string, tenantId: string, fields: AgreementInput) {
  const accountId = await requireAccountId();
  await prisma.tenant.findFirstOrThrow({ where: { id: tenantId, accountId } });
  const current = await prisma.agreement.findFirst({ where: { tenantId }, orderBy: { version: "desc" } });
  if (!current) return;

  await prisma.$transaction([
    prisma.agreement.update({
      where: { id: current.id },
      data: {
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
  const accountId = await requireAccountId();
  await prisma.tenant.findFirstOrThrow({ where: { id: tenantId, accountId } });
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      noticeDate: new Date(input.noticeDate),
      expectedVacateDate: new Date(input.expectedVacateDate),
    },
  });

  await logActivity(accountId, actor, "Notice recorded", `${tenant.name} · leaving ${input.expectedVacateDate}`);
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/");
}

export async function cancelNotice(actor: string, tenantId: string) {
  const accountId = await requireAccountId();
  await prisma.tenant.findFirstOrThrow({ where: { id: tenantId, accountId } });
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { noticeDate: null, expectedVacateDate: null },
  });
  await logActivity(accountId, actor, "Notice withdrawn", tenant.name);
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
    /** Current number on the room's open meter reading, if the owner read it as part of checkout. */
    finalMeterReading?: number;
    /** Proof photo of that same number, required whenever a reading is entered. */
    finalMeterPhotoUrl?: string;
  }
) {
  const accountId = await requireAccountId();
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { id: tenantId, accountId } });
  const checkoutDate = new Date(input.checkoutDate);
  const totalDeductions = input.deductions.reduce((s, d) => s + Number(d.amount || 0), 0);

  // Closing the room's meter here, before the deposit is settled, is what
  // makes the tenant's share of the electricity used since it opened show up
  // as a normal unpaid charge below, split with whoever else is still there.
  if (input.finalMeterReading !== undefined && tenant.roomId) {
    const open = await getOpenReadingForRoom(tenant.roomId);
    if (open) {
      await closeElectricityReading(actor, open.id, input.finalMeterReading, input.checkoutDate, input.finalMeterPhotoUrl);
    }
  }

  // Anything still on their account comes out of the deposit first, recorded as
  // a real payment so the charges show settled rather than silently vanishing.
  const openCharges = await prisma.charge.findMany({
    where: { tenantId, accountId, waived: false },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: { allocations: { select: { amount: true } } },
  });
  const unpaidCharges = openCharges.reduce((sum, c) => sum + chargeOutstanding(c), 0);

  if (unpaidCharges > 0.005) {
    const settlement = await prisma.ledgerEntry.create({
      data: {
        accountId,
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
        accountId,
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
    accountId,
    actor,
    "Tenant checked out",
    `${tenant.name} · ${refundAmount >= 0 ? "refund" : "owed"} ₹${Math.abs(refundAmount)} via ${input.refundMethod}`
  );

  if (tenant.roomId) await resetElectricityIfRoomEmpty(actor, tenant.roomId);

  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
  revalidatePath("/rooms");
  revalidatePath("/ledger");
  revalidatePath("/");
  return { refundAmount, totalDeductions, unpaidCharges };
}
