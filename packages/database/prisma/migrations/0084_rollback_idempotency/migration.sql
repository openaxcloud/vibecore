-- Idempotence DURABLE des rollbacks (réserve expert P1).
--
-- Un rollback n'est pas naturellement idempotent : le rejouer coupe une NOUVELLE release.
-- Un client qui perd sa 201 (timeout de proxy, redémarrage de pod, connexion coupée) et
-- réessaie fait donc osciller l'environnement v1 → v2 → v1… Une table est nécessaire :
-- un index en mémoire ne survit ni au redémarrage ni au routage vers une autre réplique.
--
-- La contrainte UNIQUE EST le mécanisme : l'INSERT est la revendication.

CREATE TABLE "RollbackIdempotency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'IN_FLIGHT',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "deploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RollbackIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RollbackIdempotency_projectId_environment_key_key"
    ON "RollbackIdempotency"("projectId", "environment", "key");

CREATE INDEX "RollbackIdempotency_projectId_environment_idx"
    ON "RollbackIdempotency"("projectId", "environment");
