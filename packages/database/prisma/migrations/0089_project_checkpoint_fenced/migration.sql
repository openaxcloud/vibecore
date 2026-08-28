-- P0-V3-09: durable, DB-clock fenced project checkpoints and restores.
--
-- Two production histories converged here: some databases first received the
-- minimal 0081 checkpoint table, while the recovery branch first received this
-- hardened table. Every statement is therefore additive/idempotent. Fresh
-- installs still obtain the exact final shape and either upgrade order remains
-- deployable without dropping checkpoint evidence.

CREATE TABLE IF NOT EXISTS "ProjectCheckpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREPARING',
    "logicalBarrierId" TEXT,
    "consistencyLevel" TEXT,
    "manifest" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "barrierProjectId" TEXT,
    "barrierOwnerToken" TEXT,
    "barrierFence" INTEGER NOT NULL DEFAULT 0,
    "barrierExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCheckpoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectCheckpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectCheckpoint_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "ProjectCheckpoint"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "requestHash" TEXT,
  ADD COLUMN IF NOT EXISTS "barrierProjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "barrierOwnerToken" TEXT,
  ADD COLUMN IF NOT EXISTS "barrierFence" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCheckpoint_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectCheckpoint"
      ADD CONSTRAINT "ProjectCheckpoint_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCheckpoint_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "ProjectCheckpoint"
      ADD CONSTRAINT "ProjectCheckpoint_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCheckpoint_barrier_shape_check'
  ) THEN
    ALTER TABLE "ProjectCheckpoint"
      ADD CONSTRAINT "ProjectCheckpoint_barrier_shape_check" CHECK (
        ("barrierProjectId" IS NULL AND "barrierOwnerToken" IS NULL AND "barrierExpiresAt" IS NULL)
        OR
        ("barrierProjectId" = "projectId" AND "logicalBarrierId" IS NOT NULL AND "barrierOwnerToken" IS NOT NULL AND "barrierExpiresAt" IS NOT NULL)
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectCheckpoint_idempotencyKey_key" ON "ProjectCheckpoint"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectCheckpoint_barrierProjectId_key" ON "ProjectCheckpoint"("barrierProjectId");
CREATE INDEX IF NOT EXISTS "ProjectCheckpoint_projectId_createdAt_idx" ON "ProjectCheckpoint"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectCheckpoint_barrierProjectId_barrierExpiresAt_idx" ON "ProjectCheckpoint"("barrierProjectId", "barrierExpiresAt");
CREATE INDEX IF NOT EXISTS "ProjectCheckpoint_state_createdAt_idx" ON "ProjectCheckpoint"("state", "createdAt");
