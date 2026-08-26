-- RMX-4/RMX-5: durable, retry-safe physical-data remix orchestration.
-- Existing RemixJob history remains readable; only new jobs receive an
-- idempotency key and request hash.

ALTER TABLE "RemixJob"
  ALTER COLUMN "state" SET DEFAULT 'PENDING',
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "operationToken" TEXT,
  ADD COLUMN "operationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "sourceSnapshotHash" TEXT,
  ADD COLUMN "storageConsentVersion" TEXT,
  ADD COLUMN "storageInventory" JSONB,
  ADD COLUMN "storageShareId" TEXT,
  ADD COLUMN "sourceDatabasePin" JSONB,
  ADD COLUMN "targetDatabaseInstanceId" TEXT,
  ADD COLUMN "cleanupTerminalState" TEXT,
  ADD COLUMN "errorCode" TEXT;

CREATE UNIQUE INDEX "RemixJob_organizationId_idempotencyKey_key"
  ON "RemixJob"("organizationId", "idempotencyKey");
CREATE INDEX "RemixJob_targetProjectId_idx" ON "RemixJob"("targetProjectId");
CREATE INDEX "RemixJob_state_operationExpiresAt_idx"
  ON "RemixJob"("state", "operationExpiresAt");

-- Add only constraints that can be repaired safely for historical jobs.
UPDATE "RemixJob" r SET "targetProjectId" = NULL
WHERE r."targetProjectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = r."targetProjectId");
UPDATE "RemixJob" r SET "targetDatabaseInstanceId" = NULL
WHERE r."targetDatabaseInstanceId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "DatabaseInstance" d WHERE d."id" = r."targetDatabaseInstanceId");

ALTER TABLE "RemixJob"
  ADD CONSTRAINT "RemixJob_targetProjectId_fkey"
    FOREIGN KEY ("targetProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RemixJob_targetDatabaseInstanceId_fkey"
    FOREIGN KEY ("targetDatabaseInstanceId") REFERENCES "DatabaseInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RemixStorageShare" (
  "id" TEXT NOT NULL,
  "sourceProjectId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "sourceOrganizationId" TEXT NOT NULL,
  "targetOrganizationId" TEXT NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "consentedByUserId" TEXT,
  "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceInventory" JSONB NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'ACTIVE',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RemixStorageShare_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RemixStorageShare_sourceProjectId_fkey"
    FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RemixStorageShare_targetProjectId_fkey"
    FOREIGN KEY ("targetProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RemixStorageShare_sourceOrganizationId_fkey"
    FOREIGN KEY ("sourceOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RemixStorageShare_targetOrganizationId_fkey"
    FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RemixStorageShare_consentedByUserId_fkey"
    FOREIGN KEY ("consentedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RemixStorageShare_targetProjectId_key"
  ON "RemixStorageShare"("targetProjectId");
CREATE INDEX "RemixStorageShare_sourceProjectId_idx"
  ON "RemixStorageShare"("sourceProjectId");
CREATE INDEX "RemixStorageShare_sourceOrganizationId_idx"
  ON "RemixStorageShare"("sourceOrganizationId");
CREATE INDEX "RemixStorageShare_targetOrganizationId_idx"
  ON "RemixStorageShare"("targetOrganizationId");

ALTER TABLE "RemixJob"
  ADD CONSTRAINT "RemixJob_storageShareId_fkey"
    FOREIGN KEY ("storageShareId") REFERENCES "RemixStorageShare"("id") ON DELETE SET NULL ON UPDATE CASCADE;
