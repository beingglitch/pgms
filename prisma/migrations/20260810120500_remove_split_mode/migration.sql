-- AlterTable
ALTER TABLE "Floor" DROP COLUMN "splitMode";

-- AlterTable
ALTER TABLE "PgInfo" DROP COLUMN "defaultSplitMode";

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "splitMode";

-- DropEnum
DROP TYPE "SplitMode";

