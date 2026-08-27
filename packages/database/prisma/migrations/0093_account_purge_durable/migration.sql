-- Durable, resumable account purge with per-effect fencing and receipts.
-- This migration is additive. It never schedules or performs a purge.

ALTER TABLE "WorkspaceRuntime"
  ADD COLUMN "purgeFrozen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "purgePlanId" TEXT,
  ADD COLUMN "purgeFenceToken" TEXT,
  ADD COLUMN "purgeFrozenAt" TIMESTAMP(3);

CREATE INDEX "WorkspaceRuntime_purgePlanId_purgeFrozen_idx"
  ON "WorkspaceRuntime"("purgePlanId", "purgeFrozen");

CREATE TABLE "PurgePlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ownerToken" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 0,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "purgeDueAt" TIMESTAMP(3) NOT NULL,
  "topologyFingerprint" TEXT NOT NULL,
  "inventory" JSONB NOT NULL,
  "correlationId" TEXT,
  "lastErrorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurgePlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurgePlan_status_check" CHECK ("status" IN ('ACTIVE', 'FAILED', 'ABANDONED', 'COMPLETED')),
  CONSTRAINT "PurgePlan_terminal_check" CHECK (
    ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL) OR
    ("status" <> 'COMPLETED' AND "completedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "PurgePlan_userId_key" ON "PurgePlan"("userId");
CREATE UNIQUE INDEX "PurgePlan_ownerToken_key" ON "PurgePlan"("ownerToken");
CREATE INDEX "PurgePlan_status_leaseExpiresAt_idx" ON "PurgePlan"("status", "leaseExpiresAt");
CREATE INDEX "PurgePlan_correlationId_idx" ON "PurgePlan"("correlationId");

CREATE TABLE "PurgeFreeze" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurgeFreeze_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurgeFreeze_resourceType_resourceId_planId_key"
  ON "PurgeFreeze"("resourceType", "resourceId", "planId");
CREATE INDEX "PurgeFreeze_resourceType_resourceId_idx"
  ON "PurgeFreeze"("resourceType", "resourceId");
CREATE INDEX "PurgeFreeze_planId_idx" ON "PurgeFreeze"("planId");

ALTER TABLE "PurgeFreeze"
  ADD CONSTRAINT "PurgeFreeze_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "PurgePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurgeFreeze"
  ADD CONSTRAINT "PurgeFreeze_resourceType_check"
  CHECK ("resourceType" IN ('membership', 'objectStorage', 'projectTopology'));

CREATE TABLE "PurgeEffect" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "effectKey" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "receipt" JSONB,
  "lastErrorCode" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurgeEffect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurgeEffect_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'FAILED', 'SUCCEEDED')),
  CONSTRAINT "PurgeEffect_receipt_state_check" CHECK (
    ("status" = 'PENDING' AND "receipt" IS NULL AND "startedAt" IS NULL AND "completedAt" IS NULL) OR
    ("status" = 'RUNNING' AND "receipt" IS NULL AND "startedAt" IS NOT NULL AND "completedAt" IS NULL) OR
    ("status" = 'FAILED' AND "receipt" IS NULL AND "lastErrorCode" IS NOT NULL AND "completedAt" IS NOT NULL) OR
    ("status" = 'SUCCEEDED' AND jsonb_typeof("receipt") = 'object' AND "lastErrorCode" IS NULL AND "completedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "PurgeEffect_planId_effectKey_key" ON "PurgeEffect"("planId", "effectKey");
CREATE INDEX "PurgeEffect_planId_status_idx" ON "PurgeEffect"("planId", "status");
CREATE INDEX "PurgeEffect_resourceType_resourceId_idx" ON "PurgeEffect"("resourceType", "resourceId");

ALTER TABLE "PurgeEffect"
  ADD CONSTRAINT "PurgeEffect_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "PurgePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PurgeReceipt" (
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "purgedAt" TIMESTAMP(3) NOT NULL,
  "proof" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurgeReceipt_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "PurgeReceipt_proof_check" CHECK (jsonb_typeof("proof") = 'object')
);

CREATE UNIQUE INDEX "PurgeReceipt_planId_key" ON "PurgeReceipt"("planId");
CREATE INDEX "PurgeReceipt_purgedAt_idx" ON "PurgeReceipt"("purgedAt");

ALTER TABLE "PurgeReceipt"
  ADD CONSTRAINT "PurgeReceipt_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "PurgePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRuntime"
  ADD CONSTRAINT "WorkspaceRuntime_purgePlanId_fkey"
  FOREIGN KEY ("purgePlanId") REFERENCES "PurgePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
