-- CreateEnum
CREATE TYPE "SharePointImportRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SharePointImportTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateTable
CREATE TABLE "SharePointImportRun" (
    "id" SERIAL NOT NULL,
    "triggeredBy" "SharePointImportTrigger" NOT NULL,
    "status" "SharePointImportRunStatus" NOT NULL DEFAULT 'SUCCESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "totalFilesFound" INTEGER NOT NULL DEFAULT 0,
    "totalFilesProcessed" INTEGER NOT NULL DEFAULT 0,
    "totalFilesSkipped" INTEGER NOT NULL DEFAULT 0,
    "totalFilesFailed" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharePointImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharePointImportRun_triggeredBy_idx" ON "SharePointImportRun"("triggeredBy");

-- CreateIndex
CREATE INDEX "SharePointImportRun_status_idx" ON "SharePointImportRun"("status");

-- CreateIndex
CREATE INDEX "SharePointImportRun_startedAt_idx" ON "SharePointImportRun"("startedAt");
