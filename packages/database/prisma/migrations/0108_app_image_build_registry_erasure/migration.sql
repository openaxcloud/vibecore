-- Durable Cloud Build producers and exact Artifact Registry erasure evidence.
-- The API commits a producer intent before Cloud Build receives a POST. Project
-- deletion then proves every producer terminal before it freezes an immutable
-- registry inventory and issues the first delete.

CREATE TYPE "AppImageBuildPhase" AS ENUM (
  'PREPARED',
  'SUBMITTING',
  'IDENTIFIED',
  'TERMINAL',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "ProjectRegistryErasureState" AS ENUM ('PREPARED', 'ERASING', 'VERIFIED');

CREATE TABLE "AppImageBuildOperation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownershipEpoch" INTEGER NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "phase" "AppImageBuildPhase" NOT NULL DEFAULT 'PREPARED',
  "operationTag" TEXT NOT NULL,
  "intentHash" TEXT NOT NULL,
  "gcpProject" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "sourceBucket" TEXT NOT NULL,
  "sourceObject" TEXT NOT NULL,
  "imageUri" TEXT NOT NULL,
  "sourceRepository" TEXT NOT NULL,
  "sourceTag" TEXT NOT NULL,
  "buildServiceAccount" TEXT NOT NULL,
  "timeoutSeconds" INTEGER NOT NULL,
  "providerBuildId" TEXT,
  "providerStatus" TEXT,
  "logUrl" TEXT,
  "imageDigest" TEXT,
  "targetRepository" TEXT,
  "targetDigest" TEXT,
  "promotionReferences" JSONB,
  "cancellationProof" JSONB,
  "lastErrorCode" TEXT,
  "submissionStartedAt" TIMESTAMP(3),
  "identifiedAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "promotionRecordedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppImageBuildOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppImageBuildOperation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AppImageBuildOperation_timeout_positive" CHECK ("timeoutSeconds" > 0),
  CONSTRAINT "AppImageBuildOperation_intent_hash_valid" CHECK ("intentHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "AppImageBuildOperation_identified_has_provider_id" CHECK (
    "phase" NOT IN ('IDENTIFIED', 'TERMINAL') OR "providerBuildId" IS NOT NULL
  ),
  CONSTRAINT "AppImageBuildOperation_terminal_has_status" CHECK (
    "phase" <> 'TERMINAL' OR "providerStatus" IN (
      'SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'
    )
  ),
  CONSTRAINT "AppImageBuildOperation_cancelled_has_proof" CHECK (
    "phase" <> 'CANCELLED' OR (
      "cancellationProof" IS NOT NULL
      AND "cancellationProof"->>'terminal' = 'true'
      AND (
        (
          "cancellationProof"->>'providerSubmissionAbsent' = 'true'
          AND "providerBuildId" IS NULL
          AND "providerStatus" IS NULL
        ) OR (
          "cancellationProof"->>'providerSubmissionAbsent' IS NULL
          AND "providerBuildId" IS NOT NULL
          AND "providerStatus" IN (
            'SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'
          )
          AND "cancellationProof"->>'buildId' = "providerBuildId"
          AND "cancellationProof"->>'providerStatus' = "providerStatus"
          AND "cancellationProof"->>'requiresRegistrySweep' = 'true'
          AND ("cancellationProof"->>'lateSuccess' = 'true') = ("providerStatus" = 'SUCCESS')
          AND "cancellationProof"->>'verifiedAt' IS NOT NULL
        )
      )
    )
  )
);

CREATE UNIQUE INDEX "AppImageBuildOperation_operationTag_key"
  ON "AppImageBuildOperation"("operationTag");
CREATE UNIQUE INDEX "AppImageBuildOperation_projectId_deploymentId_key"
  ON "AppImageBuildOperation"("projectId", "deploymentId");
CREATE UNIQUE INDEX "AppImageBuildOperation_gcpProject_region_providerBuildId_key"
  ON "AppImageBuildOperation"("gcpProject", "region", "providerBuildId");
CREATE INDEX "AppImageBuildOperation_projectId_phase_createdAt_idx"
  ON "AppImageBuildOperation"("projectId", "phase", "createdAt");
CREATE INDEX "AppImageBuildOperation_organizationId_phase_createdAt_idx"
  ON "AppImageBuildOperation"("organizationId", "phase", "createdAt");
CREATE INDEX "AppImageBuildOperation_sourceRepository_imageDigest_idx"
  ON "AppImageBuildOperation"("sourceRepository", "imageDigest");
CREATE INDEX "AppImageBuildOperation_targetRepository_targetDigest_idx"
  ON "AppImageBuildOperation"("targetRepository", "targetDigest");

CREATE TABLE "ProjectRegistryErasure" (
  "operationId" TEXT NOT NULL,
  "projectIdSnapshot" TEXT NOT NULL,
  "inventoryHash" TEXT NOT NULL,
  "inventory" JSONB NOT NULL,
  "state" "ProjectRegistryErasureState" NOT NULL DEFAULT 'PREPARED',
  "receipt" JSONB,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectStartedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRegistryErasure_pkey" PRIMARY KEY ("operationId"),
  CONSTRAINT "ProjectRegistryErasure_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "ObjectStorageOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectRegistryErasure_verified_has_receipt" CHECK (
    "state" <> 'VERIFIED' OR (
      "receipt" IS NOT NULL
      AND "verifiedAt" IS NOT NULL
      AND "receipt"->>'schemaVersion' = '1'
      AND "receipt"->>'inventoryHash' = "inventoryHash"
    )
  )
);

CREATE UNIQUE INDEX "ProjectRegistryErasure_inventoryHash_key"
  ON "ProjectRegistryErasure"("inventoryHash");
CREATE INDEX "ProjectRegistryErasure_projectIdSnapshot_state_idx"
  ON "ProjectRegistryErasure"("projectIdSnapshot", "state");

CREATE FUNCTION "guard_app_image_build_operation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."projectId", NEW."organizationId", NEW."ownershipEpoch", NEW."deploymentId",
    NEW."operationTag", NEW."intentHash", NEW."gcpProject", NEW."region", NEW."sourceBucket",
    NEW."sourceObject", NEW."imageUri", NEW."sourceRepository", NEW."sourceTag",
    NEW."buildServiceAccount", NEW."timeoutSeconds", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."projectId", OLD."organizationId", OLD."ownershipEpoch", OLD."deploymentId",
    OLD."operationTag", OLD."intentHash", OLD."gcpProject", OLD."region", OLD."sourceBucket",
    OLD."sourceObject", OLD."imageUri", OLD."sourceRepository", OLD."sourceTag",
    OLD."buildServiceAccount", OLD."timeoutSeconds", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_INTENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."providerBuildId" IS NOT NULL
     AND NEW."providerBuildId" IS DISTINCT FROM OLD."providerBuildId" THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_PROVIDER_ID_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."imageDigest" IS NOT NULL
     AND NEW."imageDigest" IS DISTINCT FROM OLD."imageDigest" THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_DIGEST_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."targetRepository" IS NOT NULL
     AND NEW."targetRepository" IS DISTINCT FROM OLD."targetRepository" THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_TARGET_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."targetDigest" IS NOT NULL
     AND NEW."targetDigest" IS DISTINCT FROM OLD."targetDigest" THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_TARGET_DIGEST_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."promotionReferences" IS NOT NULL
     AND NEW."promotionReferences" IS DISTINCT FROM OLD."promotionReferences" THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_PROMOTION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."phase" IS DISTINCT FROM OLD."phase" AND NOT (
    (OLD."phase" = 'PREPARED' AND NEW."phase" IN ('SUBMITTING', 'CANCELLED')) OR
    (OLD."phase" = 'SUBMITTING' AND NEW."phase" IN ('IDENTIFIED', 'REJECTED')) OR
    (OLD."phase" = 'IDENTIFIED' AND NEW."phase" = 'TERMINAL') OR
    (OLD."phase" IN ('IDENTIFIED', 'TERMINAL', 'REJECTED') AND NEW."phase" = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_PHASE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD."phase" = 'CANCELLED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_CANCELLED_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AppImageBuildOperation_guard_update"
BEFORE UPDATE ON "AppImageBuildOperation"
FOR EACH ROW EXECUTE FUNCTION "guard_app_image_build_operation"();

CREATE FUNCTION "guard_project_registry_erasure"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."operationId", NEW."projectIdSnapshot", NEW."inventoryHash", NEW."inventory", NEW."preparedAt")
     IS DISTINCT FROM
     ROW(OLD."operationId", OLD."projectIdSnapshot", OLD."inventoryHash", OLD."inventory", OLD."preparedAt") THEN
    RAISE EXCEPTION 'PROJECT_REGISTRY_ERASURE_INVENTORY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
    (OLD."state" = 'PREPARED' AND NEW."state" = 'ERASING') OR
    (OLD."state" = 'ERASING' AND NEW."state" = 'VERIFIED')
  ) THEN
    RAISE EXCEPTION 'PROJECT_REGISTRY_ERASURE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD."receipt" IS NOT NULL AND NEW."receipt" IS DISTINCT FROM OLD."receipt" THEN
    RAISE EXCEPTION 'PROJECT_REGISTRY_ERASURE_RECEIPT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."state" = 'VERIFIED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'PROJECT_REGISTRY_ERASURE_VERIFIED_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectRegistryErasure_guard_update"
BEFORE UPDATE ON "ProjectRegistryErasure"
FOR EACH ROW EXECUTE FUNCTION "guard_project_registry_erasure"();
