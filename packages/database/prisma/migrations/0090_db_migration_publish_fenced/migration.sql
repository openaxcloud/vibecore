-- P0-V3-11: fenced, resumable schema migration before production publish.
-- 0087-0089 are reserved by the physical-remix, CloudTenant and checkpoint
-- hardening lots assembled in the same release train.
CREATE TABLE "DBMigrationExecution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'LOCK_ACQUIRED',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "activeLock" TEXT,
    "ownerToken" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "plan" JSONB NOT NULL,
    "statementsSha256" TEXT NOT NULL,
    "statementCount" INTEGER NOT NULL DEFAULT 0,
    "appliedStatements" INTEGER NOT NULL DEFAULT 0,
    "backwardCompatible" BOOLEAN NOT NULL,
    "forwardCompatible" BOOLEAN NOT NULL,
    "backupId" TEXT,
    "backupVerifiedAt" TIMESTAMP(3),
    "backupVerificationMethod" TEXT,
    "deploymentId" TEXT,
    "createdByUserId" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DBMigrationExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DBMigrationExecution_activeLock_key"
    ON "DBMigrationExecution"("activeLock");
CREATE UNIQUE INDEX "DBMigrationExecution_projectId_idempotencyKey_key"
    ON "DBMigrationExecution"("projectId", "idempotencyKey");
CREATE INDEX "DBMigrationExecution_projectId_environment_state_idx"
    ON "DBMigrationExecution"("projectId", "environment", "state");
CREATE INDEX "DBMigrationExecution_activeLock_leaseExpiresAt_idx"
    ON "DBMigrationExecution"("activeLock", "leaseExpiresAt");
