-- P0-V3-09: durable, DB-clock fenced project checkpoints and restores.

CREATE TABLE "ProjectCheckpoint" (
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

CREATE UNIQUE INDEX "ProjectCheckpoint_idempotencyKey_key" ON "ProjectCheckpoint"("idempotencyKey");
CREATE UNIQUE INDEX "ProjectCheckpoint_barrierProjectId_key" ON "ProjectCheckpoint"("barrierProjectId");
CREATE INDEX "ProjectCheckpoint_projectId_createdAt_idx" ON "ProjectCheckpoint"("projectId", "createdAt");
CREATE INDEX "ProjectCheckpoint_barrierProjectId_barrierExpiresAt_idx" ON "ProjectCheckpoint"("barrierProjectId", "barrierExpiresAt");
CREATE INDEX "ProjectCheckpoint_state_createdAt_idx" ON "ProjectCheckpoint"("state", "createdAt");

ALTER TABLE "ProjectCheckpoint" ADD CONSTRAINT "ProjectCheckpoint_barrier_shape_check" CHECK (
  ("barrierProjectId" IS NULL AND "barrierOwnerToken" IS NULL AND "barrierExpiresAt" IS NULL)
  OR
  ("barrierProjectId" = "projectId" AND "logicalBarrierId" IS NOT NULL AND "barrierOwnerToken" IS NOT NULL AND "barrierExpiresAt" IS NOT NULL)
);
