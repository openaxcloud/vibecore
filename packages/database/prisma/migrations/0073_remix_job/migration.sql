-- Secure project remix pipeline job (DOMAIN_MODEL §1).
-- Tracks the normative state machine so credentials-detached-before-cloning is
-- auditable. detachedKeys/scanFindings hold references + finding locations only,
-- never a secret value. Idempotent for parallel-branch re-entrancy.

CREATE TABLE IF NOT EXISTS "RemixJob" (
    "id" TEXT NOT NULL,
    "sourceProjectId" TEXT NOT NULL,
    "targetProjectId" TEXT,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'SNAPSHOT_PINNED',
    "detachedKeys" JSONB,
    "storagePolicy" TEXT NOT NULL DEFAULT 'DETACH',
    "scanFindings" JSONB,
    "scrubbedCount" INTEGER NOT NULL DEFAULT 0,
    "dbForked" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemixJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RemixJob_sourceProjectId_idx" ON "RemixJob"("sourceProjectId");
CREATE INDEX IF NOT EXISTS "RemixJob_organizationId_createdAt_idx" ON "RemixJob"("organizationId", "createdAt");
