/*
  Warnings:

  - Changed the type of `direction` on the `Association` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Association" DROP COLUMN "direction",
ADD COLUMN     "direction" TEXT NOT NULL;

-- DropEnum
DROP TYPE "Direction";

-- DropEnum
DROP TYPE "Mark";

-- CreateIndex
CREATE INDEX "Association_pairId_direction_idx" ON "Association"("pairId", "direction");
