-- AlterTable
ALTER TABLE "PgInfo" DROP COLUMN "rentDueDay";

-- CreateIndex
CREATE UNIQUE INDEX "Charge_tenantId_period_type_key" ON "Charge"("tenantId", "period", "type");
