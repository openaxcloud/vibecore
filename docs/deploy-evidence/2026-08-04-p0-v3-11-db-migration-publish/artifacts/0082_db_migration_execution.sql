-- 0082_db_migration_execution — exécution de migration de schéma au Publish
-- (P0-V3-11, CTR-DATABASE). 0081 est réservé au checkpoint projet (PR #78).
CREATE TABLE "DBMigrationExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PLANNED',
    "idempotencyKey" TEXT NOT NULL,
    -- Verrou : `<projectId>:<environment>` tant que l'exécution est active, NULL
    -- une fois terminale. Voir l'index UNIQUE plus bas.
    "activeLock" TEXT,
    "backupId" TEXT,
    "backupVerifiedAt" TIMESTAMP(3),
    "backupVerificationMethod" TEXT,
    "backwardCompatible" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "forwardCompatible" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "statementsSha256" TEXT,
    "statementCount" INTEGER NOT NULL DEFAULT 0,
    "appliedStatements" INTEGER NOT NULL DEFAULT 0,
    "deploymentId" TEXT,
    "createdByUserId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DBMigrationExecution_pkey" PRIMARY KEY ("id")
);

-- Idempotence : rejouer la même clé renvoie la ligne existante au lieu de
-- ré-appliquer la migration.
CREATE UNIQUE INDEX "DBMigrationExecution_projectId_idempotencyKey_key"
    ON "DBMigrationExecution"("projectId", "idempotencyKey");

-- LE VERROU (I-MIG-2), tenu par le SGBD et non par l'application. Postgres
-- traite les NULL comme distincts dans un index unique : autant de lignes
-- terminées (activeLock NULL) que voulu, mais UNE SEULE active par
-- (projet, environnement). Une 2e migration concurrente se heurte à une
-- violation d'unicité — y compris depuis un AUTRE replica de l'API, ce qu'une
-- vérification applicative « liste les actives puis décide » ne garantit pas
-- (fenêtre de course entre le SELECT et l'INSERT).
CREATE UNIQUE INDEX "DBMigrationExecution_activeLock_key"
    ON "DBMigrationExecution"("activeLock");

CREATE INDEX "DBMigrationExecution_projectId_environment_state_idx"
    ON "DBMigrationExecution"("projectId", "environment", "state");
