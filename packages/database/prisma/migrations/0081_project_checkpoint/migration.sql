-- 0081_project_checkpoint — checkpoint PROJET coordonné (plan §15, CTR-CHECKPOINT).
-- (0078 ledger double-entrée, 0079 skill interop audit, 0080 plan replit parity.)
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
    -- Bail de barrière. La barrière d'écriture se lit DANS CETTE COLONNE et non
    -- en mémoire de processus : l'API tourne en 2..6 replicas (values-prod.yaml),
    -- donc une barrière in-process est invisible aux autres replicas et ne gèle
    -- rien. NULL/passé = dégelé — l'expiration EST le dégel garanti, même si le
    -- processus porteur meurt en vol.
    "barrierExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectCheckpoint_projectId_createdAt_idx" ON "ProjectCheckpoint"("projectId", "createdAt");
-- Lookup de barrière active sur le chemin chaud des écritures fichiers.
CREATE INDEX "ProjectCheckpoint_projectId_barrierExpiresAt_idx" ON "ProjectCheckpoint"("projectId", "barrierExpiresAt");
