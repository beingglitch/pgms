/*
  Warnings:

  - You are about to drop the `Manager` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "PgInfo" ADD COLUMN     "ownerName" TEXT NOT NULL DEFAULT 'Owner';

-- DropTable
DROP TABLE "Manager";
