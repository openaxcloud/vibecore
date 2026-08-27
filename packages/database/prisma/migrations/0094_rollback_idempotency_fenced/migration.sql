-- Durable, cross-replica rollback execution. All deadlines are written and
-- compared with PostgreSQL clock_timestamp(); application clocks never decide
-- ownership. The fencing token prevents an expired executor from publishing or
-- completing a response after another replica has recovered the operation.
CREATE TABLE "RollbackIdempotencyRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "phase" TEXT NOT NULL DEFAULT 'CLAIMED',
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "fencingToken" INTEGER NOT NULL DEFAULT 1,
    "effectFencingToken" INTEGER,
    "deploymentId" TEXT,
    "expectedHeadVersion" INTEGER,
    "previousManifestId" TEXT,
    "projectManifestDigest" TEXT,
    "responseStatus" INTEGER,
    "responseContentLanguage" TEXT,
    "responseBody" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RollbackIdempotencyRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RollbackIdempotencyRequest_status_check"
      CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED')),
    CONSTRAINT "RollbackIdempotencyRequest_phase_check"
      CHECK (
        "phase" IN (
          'CLAIMED', 'TARGET_BOUND', 'DEPLOYMENT_CREATED',
          'EFFECT_STARTED', 'EFFECT_CLEANED', 'RELEASE_COMMITTED'
        )
      ),
    CONSTRAINT "RollbackIdempotencyRequest_fencingToken_check"
      CHECK ("fencingToken" > 0),
    CONSTRAINT "RollbackIdempotencyRequest_effect_fence_check" CHECK (
      (
        "phase" IN ('CLAIMED', 'TARGET_BOUND', 'DEPLOYMENT_CREATED')
        AND "effectFencingToken" IS NULL
      )
      OR
      (
        "phase" IN ('EFFECT_STARTED', 'EFFECT_CLEANED', 'RELEASE_COMMITTED')
        AND "effectFencingToken" IS NOT NULL
        AND "effectFencingToken" > 0
        AND "effectFencingToken" <= "fencingToken"
      )
    ),
    CONSTRAINT "RollbackIdempotencyRequest_key_shape_check"
      CHECK (char_length("idempotencyKey") BETWEEN 1 AND 200),
    CONSTRAINT "RollbackIdempotencyRequest_fingerprint_shape_check"
      CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "RollbackIdempotencyRequest_environment_shape_check"
      CHECK (char_length("environment") BETWEEN 1 AND 64),
    CONSTRAINT "RollbackIdempotencyRequest_lease_shape_check" CHECK (
      ("status" = 'IN_PROGRESS' AND "leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
      OR
      ("status" = 'COMPLETED' AND "leaseOwner" IS NULL AND "leaseExpiresAt" IS NULL)
    ),
    CONSTRAINT "RollbackIdempotencyRequest_target_shape_check" CHECK (
      (
        "phase" = 'CLAIMED'
        AND "deploymentId" IS NULL
        AND "expectedHeadVersion" IS NULL
        AND "previousManifestId" IS NULL
        AND "projectManifestDigest" IS NULL
      )
      OR
      (
        "phase" <> 'CLAIMED'
        AND nullif("deploymentId", '') IS NOT NULL
        AND "expectedHeadVersion" IS NOT NULL
        AND "expectedHeadVersion" >= 0
        AND nullif("previousManifestId", '') IS NOT NULL
        AND "projectManifestDigest" ~ '^sha256:[0-9a-f]{64}$'
      )
    ),
    CONSTRAINT "RollbackIdempotencyRequest_response_status_check"
      CHECK ("responseStatus" IS NULL OR "responseStatus" BETWEEN 100 AND 599),
    CONSTRAINT "RollbackIdempotencyRequest_response_language_check"
      CHECK ("responseContentLanguage" IS NULL OR "responseContentLanguage" IN ('en', 'fr')),
    CONSTRAINT "RollbackIdempotencyRequest_completion_check" CHECK (
      (
        "status" = 'IN_PROGRESS'
        AND "completedAt" IS NULL
        AND "responseStatus" IS NULL
        AND "responseContentLanguage" IS NULL
        AND "responseBody" IS NULL
      )
      OR
      (
        "status" = 'COMPLETED'
        AND "phase" <> 'EFFECT_STARTED'
        AND "completedAt" IS NOT NULL
        AND "responseStatus" IS NOT NULL
        AND ("responseStatus" >= 400 OR "phase" = 'RELEASE_COMMITTED')
        AND "responseContentLanguage" IS NOT NULL
        AND "responseBody" IS NOT NULL
        AND jsonb_typeof("responseBody") = 'object'
      )
    )
);

CREATE UNIQUE INDEX "RollbackIdempotencyRequest_projectId_idempotencyKey_key"
ON "RollbackIdempotencyRequest"("projectId", "idempotencyKey");

CREATE UNIQUE INDEX "RollbackIdempotencyRequest_deploymentId_key"
ON "RollbackIdempotencyRequest"("deploymentId");

CREATE INDEX "RollbackIdempotencyRequest_status_leaseExpiresAt_idx"
ON "RollbackIdempotencyRequest"("status", "leaseExpiresAt");

CREATE INDEX "RollbackIdempotencyRequest_projectId_environment_status_idx"
ON "RollbackIdempotencyRequest"("projectId", "environment", "status");

CREATE INDEX "RollbackIdempotencyRequest_previousManifestId_idx"
ON "RollbackIdempotencyRequest"("previousManifestId");

ALTER TABLE "RollbackIdempotencyRequest"
ADD CONSTRAINT "RollbackIdempotencyRequest_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
