-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('MANUAL', 'SHAREPOINT');

-- AlterTable
ALTER TABLE "ImportLog" ADD COLUMN     "importSource" "ImportSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sharePointFileId" TEXT,
ADD COLUMN     "sharePointFileModifiedDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ImportLog_sharePointFileId_idx" ON "ImportLog"("sharePointFileId");

-- CreateIndex
CREATE INDEX "ImportLog_importSource_idx" ON "ImportLog"("importSource");
