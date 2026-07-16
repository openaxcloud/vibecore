-- Secure project import pipeline job (DOMAIN_MODEL §2).
-- Disposable-staging state machine; findings are REDACTED (no raw value);
-- targetProjectId is set ONLY at the atomic commit (null = target never touched).
-- Idempotent for parallel-branch re-entrancy.

CREATE TABLE IF NOT EXISTS "ImportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "provider" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RECEIVED',
    "sourceRef" TEXT,
    "findings" JSONB,
    "consent" JSONB,
    "targetProjectId" TEXT,
    "stagedFileCount" INTEGER NOT NULL DEFAULT 0,
    "redactedCount" INTEGER NOT NULL DEFAULT 0,
    "creditsReserved" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportJob_organizationId_createdAt_idx" ON "ImportJob"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ImportJob_state_idx" ON "ImportJob"("state");
