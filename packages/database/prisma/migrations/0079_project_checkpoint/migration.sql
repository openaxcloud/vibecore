-- 0079_project_checkpoint — checkpoint PROJET coordonné (plan §15, CTR-CHECKPOINT).
-- (0078 est réservé au ledger double-entrée de la PR #28.)
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectCheckpoint_projectId_createdAt_idx" ON "ProjectCheckpoint"("projectId", "createdAt");
