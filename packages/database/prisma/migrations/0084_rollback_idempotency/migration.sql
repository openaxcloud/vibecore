-- Durable idempotency for rollback-to-previous. The response is committed before
-- Fastify writes it to the client, so a disconnected client can safely replay the
-- exact operation on another API replica without advancing the release stream.
CREATE TABLE "RollbackIdempotencyRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "deploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RollbackIdempotencyRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RollbackIdempotencyRequest_status_check"
      CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED'))
);

CREATE UNIQUE INDEX "RollbackIdempotencyRequest_projectId_idempotencyKey_key"
ON "RollbackIdempotencyRequest"("projectId", "idempotencyKey");

CREATE INDEX "RollbackIdempotencyRequest_status_updatedAt_idx"
ON "RollbackIdempotencyRequest"("status", "updatedAt");

ALTER TABLE "RollbackIdempotencyRequest"
ADD CONSTRAINT "RollbackIdempotencyRequest_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
