-- Managed-database provisioning must have a durable terminal failure state.
-- Existing PROVISIONING rows get a bounded grace from their original creation
-- time so the read/maintenance reconcilers can retire historical zombies.

ALTER TYPE "DatabaseInstanceStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "DatabaseInstance"
  ADD COLUMN IF NOT EXISTS "provisioningDeadlineAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastErrorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "lastErrorAt" TIMESTAMP(3);

UPDATE "DatabaseInstance"
SET "provisioningDeadlineAt" = "createdAt" + INTERVAL '10 minutes'
WHERE "status" = 'PROVISIONING'
  AND "provisioningDeadlineAt" IS NULL;

CREATE INDEX IF NOT EXISTS "DatabaseInstance_status_provisioningDeadlineAt_idx"
  ON "DatabaseInstance"("status", "provisioningDeadlineAt");
