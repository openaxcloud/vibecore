-- Durable, tenant-scoped import staging/idempotency and CAS commit ownership.
-- Existing jobs receive non-colliding legacy keys so this remains deployable on
-- databases that already contain import history.

ALTER TABLE "ImportJob"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "stagedFiles" JSONB,
  ADD COLUMN "connectorPreview" JSONB,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "operationToken" TEXT,
  ADD COLUMN "operationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "cleanupTerminalState" TEXT;

UPDATE "ImportJob"
SET
  "idempotencyKey" = 'legacy:' || "id",
  "requestHash" = md5('legacy:' || "id") || md5('legacy:2:' || "id")
WHERE "idempotencyKey" IS NULL OR "requestHash" IS NULL;

ALTER TABLE "ImportJob"
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "requestHash" SET NOT NULL;

CREATE UNIQUE INDEX "ImportJob_organizationId_idempotencyKey_key"
  ON "ImportJob"("organizationId", "idempotencyKey");
CREATE INDEX "ImportJob_targetProjectId_idx" ON "ImportJob"("targetProjectId");

DELETE FROM "ImportJob" j
WHERE NOT EXISTS (SELECT 1 FROM "Organization" o WHERE o."id" = j."organizationId");
UPDATE "ImportJob" j SET "actorUserId" = NULL
WHERE j."actorUserId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = j."actorUserId");
UPDATE "ImportJob" j SET "targetProjectId" = NULL
WHERE j."targetProjectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = j."targetProjectId");

ALTER TABLE "ImportJob"
  ADD CONSTRAINT "ImportJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ImportJob_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ImportJob_targetProjectId_fkey"
    FOREIGN KEY ("targetProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ImportCreditReservation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "importJobId" TEXT NOT NULL,
  "reservedCredits" INTEGER NOT NULL,
  "debitedCredits" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportCreditReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImportCreditReservation_importJobId_fkey"
    FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ImportCreditReservation_importJobId_key"
  ON "ImportCreditReservation"("importJobId");
CREATE UNIQUE INDEX "ImportCreditReservation_organizationId_key_key"
  ON "ImportCreditReservation"("organizationId", "key");
CREATE INDEX "ImportCreditReservation_organizationId_idx"
  ON "ImportCreditReservation"("organizationId");

-- Backfill a conservative reservation history. A committed legacy import is
-- settled; every other terminal import is compensated; live jobs stay reserved.
INSERT INTO "ImportCreditReservation" (
  "id", "organizationId", "key", "importJobId", "reservedCredits",
  "debitedCredits", "state", "version", "createdAt", "updatedAt"
)
SELECT
  'icr_' || "id",
  "organizationId",
  "idempotencyKey",
  "id",
  GREATEST(1, "stagedFileCount"),
  CASE WHEN "state" = 'COMMITTED' THEN GREATEST(1, "stagedFileCount") ELSE 0 END,
  CASE
    WHEN "state" = 'COMMITTED' THEN 'SETTLED'
    WHEN "state" IN ('ROLLING_BACK', 'EXPIRED', 'CANCELLED', 'FAILED') THEN 'COMPENSATED'
    ELSE 'RESERVED'
  END,
  0,
  "createdAt",
  "updatedAt"
FROM "ImportJob";
