CREATE TYPE "ProjectRuntimeEffectState" AS ENUM (
  'PREPARED',
  'IN_FLIGHT',
  'SETTLED',
  'DRAINING',
  'DRAINED',
  'ABORTED'
);

CREATE TABLE "ProjectRuntimeEffect" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownershipEpoch" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "intentHash" TEXT NOT NULL,
  "targetDigest" TEXT NOT NULL,
  "fencingToken" BIGINT NOT NULL DEFAULT 1,
  "ownerToken" TEXT,
  "state" "ProjectRuntimeEffectState" NOT NULL DEFAULT 'PREPARED',
  "leaseExpiresAt" TIMESTAMP(3),
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatchedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "drainingAt" TIMESTAMP(3),
  "drainedAt" TIMESTAMP(3),
  "abortedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "providerReceipt" JSONB,
  "operatorQuiescenceHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRuntimeEffect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectRuntimeEffect_identity_check" CHECK (
    char_length("action") BETWEEN 1 AND 80
    AND "action" ~ '^[A-Z][A-Z0-9_]*$'
    AND char_length("resourceId") BETWEEN 1 AND 255
    AND "intentHash" ~ '^[0-9a-f]{64}$'
    AND "targetDigest" ~ '^[0-9a-f]{64}$'
    AND "ownershipEpoch" >= 0
    AND "fencingToken" > 0
  ),
  CONSTRAINT "ProjectRuntimeEffect_owner_check" CHECK (
    ("state" IN ('PREPARED', 'IN_FLIGHT') AND "ownerToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    OR ("state" NOT IN ('PREPARED', 'IN_FLIGHT') AND "ownerToken" IS NULL AND "leaseExpiresAt" IS NULL)
  )
);

CREATE TABLE "ProjectRuntimeEffectTarget" (
  "effectId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "expectedUid" TEXT,
  "expectedResourceVersion" TEXT,
  "manifestDigest" TEXT,
  CONSTRAINT "ProjectRuntimeEffectTarget_pkey" PRIMARY KEY ("effectId", "ordinal"),
  CONSTRAINT "ProjectRuntimeEffectTarget_identity_check" CHECK (
    "ordinal" >= 0
    AND char_length("kind") BETWEEN 1 AND 80
    AND "kind" ~ '^[A-Za-z][A-Za-z0-9.]*$'
    AND char_length("namespace") BETWEEN 1 AND 253
    AND char_length("name") BETWEEN 1 AND 253
    AND ("expectedUid" IS NULL OR char_length("expectedUid") BETWEEN 1 AND 255)
    AND ("expectedResourceVersion" IS NULL OR char_length("expectedResourceVersion") BETWEEN 1 AND 255)
    AND ("manifestDigest" IS NULL OR "manifestDigest" ~ '^[0-9a-f]{64}$')
  )
);

ALTER TABLE "ProjectRuntimeEffect"
  ADD CONSTRAINT "ProjectRuntimeEffect_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectRuntimeEffectTarget"
  ADD CONSTRAINT "ProjectRuntimeEffectTarget_effectId_fkey"
  FOREIGN KEY ("effectId") REFERENCES "ProjectRuntimeEffect"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProjectRuntimeEffect_projectId_state_createdAt_idx"
  ON "ProjectRuntimeEffect"("projectId", "state", "createdAt");
CREATE INDEX "ProjectRuntimeEffect_organizationId_state_createdAt_idx"
  ON "ProjectRuntimeEffect"("organizationId", "state", "createdAt");
CREATE INDEX "ProjectRuntimeEffect_state_leaseExpiresAt_idx"
  ON "ProjectRuntimeEffect"("state", "leaseExpiresAt");
CREATE UNIQUE INDEX "ProjectRuntimeEffect_active_resource_key"
  ON "ProjectRuntimeEffect"("projectId", "action", "resourceId")
  WHERE "state" IN ('PREPARED', 'IN_FLIGHT');
CREATE UNIQUE INDEX "ProjectRuntimeEffectTarget_identity_key"
  ON "ProjectRuntimeEffectTarget"("effectId", "kind", "namespace", "name");
CREATE INDEX "ProjectRuntimeEffectTarget_resource_idx"
  ON "ProjectRuntimeEffectTarget"("kind", "namespace", "name");

CREATE FUNCTION "vibecore_project_runtime_effect_transition_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."projectId" <> OLD."projectId"
     OR NEW."organizationId" <> OLD."organizationId"
     OR NEW."ownershipEpoch" <> OLD."ownershipEpoch"
     OR NEW."action" <> OLD."action"
     OR NEW."resourceId" <> OLD."resourceId"
     OR NEW."intentHash" <> OLD."intentHash"
     OR NEW."targetDigest" <> OLD."targetDigest"
     OR NEW."fencingToken" <> OLD."fencingToken"
     OR NEW."preparedAt" <> OLD."preparedAt"
  THEN
    RAISE EXCEPTION 'PROJECT_RUNTIME_EFFECT_IDENTITY_IMMUTABLE';
  END IF;

  IF NEW."state" = OLD."state" THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."state" = 'PREPARED' AND NEW."state" IN ('IN_FLIGHT', 'ABORTED'))
    OR (OLD."state" = 'IN_FLIGHT' AND NEW."state" = 'SETTLED')
    OR (OLD."state" = 'SETTLED' AND NEW."state" = 'DRAINING')
    OR (OLD."state" = 'DRAINING' AND NEW."state" = 'DRAINED')
  ) THEN
    RAISE EXCEPTION 'PROJECT_RUNTIME_EFFECT_TRANSITION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectRuntimeEffect_transition_guard"
BEFORE UPDATE ON "ProjectRuntimeEffect"
FOR EACH ROW EXECUTE FUNCTION "vibecore_project_runtime_effect_transition_guard"();

CREATE FUNCTION "vibecore_project_runtime_effect_target_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PROJECT_RUNTIME_EFFECT_TARGET_IMMUTABLE';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "ProjectRuntimeEffectTarget_immutable"
BEFORE UPDATE ON "ProjectRuntimeEffectTarget"
FOR EACH ROW EXECUTE FUNCTION "vibecore_project_runtime_effect_target_immutable"();
