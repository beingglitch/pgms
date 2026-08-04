-- Reuse PaymentMode (UPI, CASH, BANK_TRANSFER, CHEQUE) for deposit/refund method instead of
-- the narrower DepositMethod enum, so all four options are available everywhere. Existing
-- values (CASH, CHEQUE, UPI) exist as labels in both enums, so this is a lossless text-cast.

ALTER TABLE "Tenant" ALTER COLUMN "depositMethod" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "depositMethod" TYPE "PaymentMode" USING ("depositMethod"::text::"PaymentMode");
ALTER TABLE "Tenant" ALTER COLUMN "depositMethod" SET DEFAULT 'CASH';

ALTER TABLE "Tenant" ALTER COLUMN "refundMethod" TYPE "PaymentMode" USING ("refundMethod"::text::"PaymentMode");

DROP TYPE "DepositMethod";
