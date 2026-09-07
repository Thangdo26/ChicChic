-- CC-B01: migration bổ sung; giữ nguyên LifecycleDecision và toàn bộ lịch sử.
BEGIN;
-- CreateEnum
CREATE TYPE "LifecycleRequestStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "TaskKind" ADD VALUE IF NOT EXISTS 'RETIRE';

-- AlterTable
ALTER TABLE "Flock" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HarvestLot" ADD COLUMN     "lifecycleRequestId" TEXT;

-- AlterTable
ALTER TABLE "BarnTask" ADD COLUMN     "lifecycleRequestId" TEXT;

-- CreateTable
CREATE TABLE "LifecycleRequest" (
    "id" TEXT NOT NULL,
    "barnId" TEXT NOT NULL,
    "flockId" TEXT NOT NULL,
    "activeFlockId" TEXT,
    "requestedById" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "choice" "EndOfLayChoice" NOT NULL,
    "status" "LifecycleRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "birdIds" TEXT[],
    "expectedCount" INTEGER NOT NULL,
    "retireFeeVnd" INTEGER NOT NULL DEFAULT 0,
    "retireTermsVersion" TEXT,
    "retireTermsAcceptedAt" TIMESTAMP(3),
    "acceptedByWorkerId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlockOutcome" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "flockId" TEXT NOT NULL,
    "choice" "EndOfLayChoice" NOT NULL,
    "qty" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "workerId" TEXT NOT NULL,
    "proofMediaId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlockOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleRequest_activeFlockId_key" ON "LifecycleRequest"("activeFlockId");

-- CreateIndex
CREATE INDEX "LifecycleRequest_barnId_createdAt_idx" ON "LifecycleRequest"("barnId", "createdAt");

-- CreateIndex
CREATE INDEX "LifecycleRequest_flockId_status_idx" ON "LifecycleRequest"("flockId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleRequest_requestedById_idempotencyKey_key" ON "LifecycleRequest"("requestedById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FlockOutcome_requestId_key" ON "FlockOutcome"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FlockOutcome_proofMediaId_key" ON "FlockOutcome"("proofMediaId");

-- CreateIndex
CREATE INDEX "FlockOutcome_flockId_completedAt_idx" ON "FlockOutcome"("flockId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HarvestLot_lifecycleRequestId_key" ON "HarvestLot"("lifecycleRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "BarnTask_lifecycleRequestId_key" ON "BarnTask"("lifecycleRequestId");

-- AddForeignKey
ALTER TABLE "HarvestLot" ADD CONSTRAINT "HarvestLot_lifecycleRequestId_fkey" FOREIGN KEY ("lifecycleRequestId") REFERENCES "LifecycleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarnTask" ADD CONSTRAINT "BarnTask_lifecycleRequestId_fkey" FOREIGN KEY ("lifecycleRequestId") REFERENCES "LifecycleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleRequest" ADD CONSTRAINT "LifecycleRequest_barnId_fkey" FOREIGN KEY ("barnId") REFERENCES "Barn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleRequest" ADD CONSTRAINT "LifecycleRequest_flockId_fkey" FOREIGN KEY ("flockId") REFERENCES "Flock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockOutcome" ADD CONSTRAINT "FlockOutcome_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LifecycleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockOutcome" ADD CONSTRAINT "FlockOutcome_flockId_fkey" FOREIGN KEY ("flockId") REFERENCES "Flock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockOutcome" ADD CONSTRAINT "FlockOutcome_proofMediaId_fkey" FOREIGN KEY ("proofMediaId") REFERENCES "BarnMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraint bổ sung ngoài Prisma: không nhận RENEW/partial outcome trong CC-B01.
ALTER TABLE "LifecycleRequest" ADD CONSTRAINT "LifecycleRequest_snapshot_check" CHECK (
  "choice" <> 'RENEW' AND "expectedCount" > 0 AND "birdIds" IS NOT NULL
  AND "expectedCount" = cardinality("birdIds") AND "version" >= 0
  AND (("status" IN ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS') AND "activeFlockId" = "flockId" AND "activeFlockId" IS NOT NULL)
    OR ("status" IN ('COMPLETED', 'DECLINED', 'CANCELLED') AND "activeFlockId" IS NULL))
);
ALTER TABLE "FlockOutcome" ADD CONSTRAINT "FlockOutcome_measurements_check" CHECK (
  "qty" > 0 AND "choice" <> 'RENEW'
  AND (("choice" = 'MEAT' AND "weightKg" IS NOT NULL AND "weightKg" > 0 AND "weightKg" < 'Infinity'::float8)
    OR ("choice" = 'RETIRE' AND "weightKg" IS NULL))
);
COMMIT;
