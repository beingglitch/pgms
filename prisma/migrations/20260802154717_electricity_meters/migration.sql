/*
  Warnings:

  - You are about to drop the column `billPhotoUrl` on the `ElectricityBill` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `ElectricityBill` table. All the data in the column will be lost.
  - You are about to drop the column `month` on the `ElectricityBill` table. All the data in the column will be lost.
  - Added the required column `endDate` to the `ElectricityBill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endReading` to the `ElectricityBill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ratePerUnit` to the `ElectricityBill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `ElectricityBill` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startReading` to the `ElectricityBill` table without a default value. This is not possible if the table is not empty.
  - Made the column `units` on table `ElectricityBill` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ElectricityBill" DROP COLUMN "billPhotoUrl",
DROP COLUMN "date",
DROP COLUMN "month",
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "endReading" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "isMainMeter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "ratePerUnit" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startReading" DECIMAL(10,2) NOT NULL,
ALTER COLUMN "tenantId" DROP NOT NULL,
ALTER COLUMN "units" SET NOT NULL;

-- AlterTable
ALTER TABLE "PgInfo" ADD COLUMN     "electricityRatePerUnit" DECIMAL(10,2) NOT NULL DEFAULT 8;

-- CreateIndex
CREATE INDEX "ElectricityBill_isMainMeter_idx" ON "ElectricityBill"("isMainMeter");

-- CreateIndex
CREATE INDEX "ElectricityBill_endDate_idx" ON "ElectricityBill"("endDate");
