-- Multi-tenant: PgInfo (a disguised singleton) becomes Account, a real
-- per-signup row keyed by email. Every other top-level table gets an
-- accountId, backfilled to the one account created from the existing
-- PgInfo row, so today's data keeps working under that account.

-- 1. PgInfo -> Account
ALTER TABLE "PgInfo" RENAME TO "Account";
ALTER TABLE "Account" ADD COLUMN "email" TEXT;
UPDATE "Account" SET "email" = 'surajshukla7656@gmail.com' WHERE "id" = 'singleton';
ALTER TABLE "Account" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "Account" ADD CONSTRAINT "Account_email_key" UNIQUE ("email");
ALTER TABLE "Account" ALTER COLUMN "passwordHash" DROP DEFAULT;
ALTER TABLE "Account" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Floor
ALTER TABLE "Floor" ADD COLUMN "accountId" TEXT;
UPDATE "Floor" SET "accountId" = 'singleton';
ALTER TABLE "Floor" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Floor_accountId_idx" ON "Floor"("accountId");
DROP INDEX "Floor_name_key";
CREATE UNIQUE INDEX "Floor_accountId_name_key" ON "Floor"("accountId", "name");

-- 3. Room
ALTER TABLE "Room" ADD COLUMN "accountId" TEXT;
UPDATE "Room" SET "accountId" = 'singleton';
ALTER TABLE "Room" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Room" ADD CONSTRAINT "Room_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Room_accountId_idx" ON "Room"("accountId");

-- 4. Tenant
ALTER TABLE "Tenant" ADD COLUMN "accountId" TEXT;
UPDATE "Tenant" SET "accountId" = 'singleton';
ALTER TABLE "Tenant" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Tenant_accountId_idx" ON "Tenant"("accountId");

-- 5. Charge
ALTER TABLE "Charge" ADD COLUMN "accountId" TEXT;
UPDATE "Charge" SET "accountId" = 'singleton';
ALTER TABLE "Charge" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Charge_accountId_idx" ON "Charge"("accountId");

-- 6. LedgerEntry (receiptNo uniqueness moves from global to per-account)
ALTER TABLE "LedgerEntry" ADD COLUMN "accountId" TEXT;
UPDATE "LedgerEntry" SET "accountId" = 'singleton';
ALTER TABLE "LedgerEntry" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");
DROP INDEX "LedgerEntry_receiptNo_key";
CREATE UNIQUE INDEX "LedgerEntry_accountId_receiptNo_key" ON "LedgerEntry"("accountId", "receiptNo");

-- 7. ElectricityBill
ALTER TABLE "ElectricityBill" ADD COLUMN "accountId" TEXT;
UPDATE "ElectricityBill" SET "accountId" = 'singleton';
ALTER TABLE "ElectricityBill" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "ElectricityBill" ADD CONSTRAINT "ElectricityBill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ElectricityBill_accountId_idx" ON "ElectricityBill"("accountId");

-- 8. Expense
ALTER TABLE "Expense" ADD COLUMN "accountId" TEXT;
UPDATE "Expense" SET "accountId" = 'singleton';
ALTER TABLE "Expense" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Expense_accountId_idx" ON "Expense"("accountId");

-- 9. Reminder
ALTER TABLE "Reminder" ADD COLUMN "accountId" TEXT;
UPDATE "Reminder" SET "accountId" = 'singleton';
ALTER TABLE "Reminder" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Reminder_accountId_idx" ON "Reminder"("accountId");

-- 10. ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN "accountId" TEXT;
UPDATE "ActivityLog" SET "accountId" = 'singleton';
ALTER TABLE "ActivityLog" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ActivityLog_accountId_idx" ON "ActivityLog"("accountId");
