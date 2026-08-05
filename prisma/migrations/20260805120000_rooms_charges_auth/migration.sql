-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('BY_CAPACITY', 'BY_OCCUPANTS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('RENT', 'ELECTRICITY', 'LAUNDRY', 'OTHER');

-- AlterTable
ALTER TABLE "ElectricityBill" ADD COLUMN     "roomId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "sourceBillId" TEXT;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "receiptNo" TEXT;

-- AlterTable
ALTER TABLE "PgInfo" ADD COLUMN     "defaultSplitMode" "SplitMode" NOT NULL DEFAULT 'BY_CAPACITY',
ADD COLUMN     "dueSoonDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "passwordHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rentDueDay" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "expectedVacateDate" TIMESTAMP(3),
ADD COLUMN     "noticeDate" TIMESTAMP(3),
ADD COLUMN     "rentOverride" DECIMAL(10,2),
ADD COLUMN     "roomId" TEXT;

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "splitMode" "SplitMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "rentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "splitMode" "SplitMode",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ChargeType" NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "sourceBillId" TEXT,
    "waived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Floor_name_key" ON "Floor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Room_floorId_number_key" ON "Room"("floorId", "number");

-- CreateIndex
CREATE INDEX "Charge_tenantId_period_idx" ON "Charge"("tenantId", "period");

-- CreateIndex
CREATE INDEX "Charge_dueDate_idx" ON "Charge"("dueDate");

-- CreateIndex
CREATE INDEX "Charge_type_idx" ON "Charge"("type");

-- CreateIndex
CREATE INDEX "Allocation_chargeId_idx" ON "Allocation"("chargeId");

-- CreateIndex
CREATE INDEX "Allocation_ledgerEntryId_idx" ON "Allocation"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "ElectricityBill_roomId_idx" ON "ElectricityBill"("roomId");

-- CreateIndex
CREATE INDEX "Expense_sourceBillId_idx" ON "Expense"("sourceBillId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_receiptNo_key" ON "LedgerEntry"("receiptNo");

-- CreateIndex
CREATE INDEX "Tenant_roomId_idx" ON "Tenant"("roomId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "ElectricityBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricityBill" ADD CONSTRAINT "ElectricityBill_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "ElectricityBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
