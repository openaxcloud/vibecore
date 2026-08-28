-- Counter-audit hardening for project image production.
--
-- 1. A SUBMITTING Cloud Build never becomes "absent" merely because a tagged
--    list is empty. The database owns a resolution deadline and only accepts an
--    explicit, audited operator proof for MANUAL_RECOVERY / REJECTED_ABSENT.
-- 2. PostgreSQL advisory locks are backed by a durable mutation fence. Losing
--    the lock session leaves AMBIGUOUS authority that no second owner may steal.
-- 3. Project packages are project-private by database invariant, so retaining
--    a cross-project last reference can never create an uncollectable package.

CREATE TYPE "RegistryMutationKind" AS ENUM (
  'APP_IMAGE_BUILD',
  'TRUSTED_IMAGE_SIGNING',
  'IMAGE_PROMOTION',
  'PROJECT_ERASURE'
);

CREATE TYPE "RegistryMutationState" AS ENUM (
  'PREPARED',
  'IN_FLIGHT',
  'AMBIGUOUS',
  'VERIFIED',
  'FAILED_SAFE'
);

ALTER TABLE "AppImageBuildOperation"
  ADD COLUMN "submissionResolveAfter" TIMESTAMP(3),
  ADD COLUMN "manualRecoveryAt" TIMESTAMP(3),
  ADD COLUMN "manualRecoveryEvidence" JSONB;

UPDATE "AppImageBuildOperation"
SET "submissionResolveAfter" = COALESCE("submissionStartedAt", "updatedAt") + INTERVAL '15 minutes'
WHERE "phase" = 'SUBMITTING'::"AppImageBuildPhase"
  AND "submissionResolveAfter" IS NULL;

ALTER TABLE "AppImageBuildOperation"
  ADD CONSTRAINT "AppImageBuildOperation_submitting_has_db_deadline" CHECK (
    "phase" <> 'SUBMITTING' OR (
      "submissionStartedAt" IS NOT NULL
      AND "submissionResolveAfter" IS NOT NULL
      AND "submissionResolveAfter" > "submissionStartedAt"
    )
  ),
  ADD CONSTRAINT "AppImageBuildOperation_manual_resolution_has_evidence" CHECK (
    "phase" NOT IN ('MANUAL_RECOVERY', 'REJECTED_ABSENT') OR (
      "manualRecoveryAt" IS NOT NULL
      AND "manualRecoveryEvidence" IS NOT NULL
      AND "manualRecoveryEvidence"->>'schemaVersion' = 'app-image-build-submission-resolution-v1'
      AND "manualRecoveryEvidence"->>'operatorUserId' <> ''
      AND "manualRecoveryEvidence"->>'auditEventId' <> ''
      AND "manualRecoveryEvidence"->>'operationTag' = "operationTag"
      AND "manualRecoveryEvidence"->>'gcpProject' = "gcpProject"
      AND "manualRecoveryEvidence"->>'region' = "region"
      AND "manualRecoveryEvidence"->>'observationWindowStartedAt' IS NOT NULL
      AND "manualRecoveryEvidence"->>'observationWindowEndedAt' IS NOT NULL
      AND ("manualRecoveryEvidence"->>'observationWindowStartedAt')::timestamptz
        >= "submissionResolveAfter" AT TIME ZONE 'UTC'
      AND ("manualRecoveryEvidence"->>'observationWindowStartedAt')::timestamptz
        < ("manualRecoveryEvidence"->>'observationWindowEndedAt')::timestamptz
      AND ("manualRecoveryEvidence"->>'observationWindowEndedAt')::timestamptz
        <= "manualRecoveryAt" AT TIME ZONE 'UTC'
      AND jsonb_typeof("manualRecoveryEvidence"->'providerQueries') = 'array'
      AND jsonb_array_length("manualRecoveryEvidence"->'providerQueries') BETWEEN 2 AND 16
      AND jsonb_array_length(
        jsonb_path_query_array(
          "manualRecoveryEvidence",
          '$.providerQueries[*] ? (@.result == "ABSENT" || @.result == "FOUND" || @.result == "AMBIGUOUS")'
        )
      ) = jsonb_array_length("manualRecoveryEvidence"->'providerQueries')
      AND jsonb_array_length(
        jsonb_path_query_array(
          "manualRecoveryEvidence",
          '$.providerQueries[*] ? (@.filter == $filter)',
          jsonb_build_object('filter', 'tags="' || "operationTag" || '"')
        )
      ) = jsonb_array_length("manualRecoveryEvidence"->'providerQueries')
      AND "manualRecoveryEvidence"->>'resolution' = "phase"::text
    ) IS TRUE
  ),
  ADD CONSTRAINT "AppImageBuildOperation_rejected_absent_exact_resolution" CHECK (
    "phase" <> 'REJECTED_ABSENT' OR (
      "providerBuildId" IS NULL
      AND "providerStatus" IS NULL
      AND "manualRecoveryEvidence"->>'resolution' = 'REJECTED_ABSENT'
      AND jsonb_array_length(
        jsonb_path_query_array(
          "manualRecoveryEvidence",
          '$.providerQueries[*] ? (@.result == "ABSENT")'
        )
      ) = jsonb_array_length("manualRecoveryEvidence"->'providerQueries')
    ) IS TRUE
  ),
  ADD CONSTRAINT "AppImageBuildOperation_source_project_package" CHECK (
    regexp_count("sourceRepository", '/') = 3
    AND right("sourceRepository", length('/p-' || lower("projectId"))) = '/p-' || lower("projectId")
  ),
  ADD CONSTRAINT "AppImageBuildOperation_target_project_package" CHECK (
    "targetRepository" IS NULL OR (
      regexp_count("targetRepository", '/') = 3
      AND right("targetRepository", length('/p-' || lower("projectId"))) = '/p-' || lower("projectId")
    )
  );

CREATE OR REPLACE FUNCTION "guard_app_image_build_operation"()
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

  IF OLD."manualRecoveryEvidence" IS NOT NULL
     AND NEW."manualRecoveryEvidence" IS DISTINCT FROM OLD."manualRecoveryEvidence"
     AND NOT (OLD."phase" = 'MANUAL_RECOVERY' AND NEW."phase" = 'REJECTED_ABSENT') THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_MANUAL_EVIDENCE_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."phase" IS DISTINCT FROM OLD."phase" AND NOT (
    (OLD."phase" = 'PREPARED' AND NEW."phase" IN ('SUBMITTING', 'CANCELLED')) OR
    (OLD."phase" = 'SUBMITTING' AND NEW."phase" IN ('IDENTIFIED', 'REJECTED', 'MANUAL_RECOVERY', 'REJECTED_ABSENT')) OR
    (OLD."phase" = 'MANUAL_RECOVERY' AND NEW."phase" IN ('IDENTIFIED', 'REJECTED_ABSENT')) OR
    (OLD."phase" = 'IDENTIFIED' AND NEW."phase" = 'TERMINAL') OR
    (OLD."phase" IN ('IDENTIFIED', 'TERMINAL', 'REJECTED', 'REJECTED_ABSENT') AND NEW."phase" = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_PHASE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD."phase" = 'CANCELLED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'APP_IMAGE_BUILD_CANCELLED_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE "RegistryMutationOperation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownershipEpoch" INTEGER NOT NULL,
  "kind" "RegistryMutationKind" NOT NULL,
  "repositories" JSONB NOT NULL,
  "intentHash" TEXT NOT NULL,
  "state" "RegistryMutationState" NOT NULL DEFAULT 'PREPARED',
  "fencingToken" BIGINT NOT NULL DEFAULT 0,
  "ownerToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "backendPid" INTEGER,
  "providerOperationId" TEXT,
  "providerEvidence" JSONB,
  "lastErrorCode" TEXT,
  "effectStartedAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "ambiguousAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "recoveredAt" TIMESTAMP(3),
  "recoveryEvidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistryMutationOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistryMutationOperation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RegistryMutationOperation_intent_hash_valid" CHECK ("intentHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "RegistryMutationOperation_repositories_nonempty" CHECK (
    jsonb_typeof("repositories") = 'array' AND jsonb_array_length("repositories") > 0
  ),
  CONSTRAINT "RegistryMutationOperation_active_has_owner" CHECK (
    "state" <> 'IN_FLIGHT' OR (
      "ownerToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "backendPid" IS NOT NULL
      AND "effectStartedAt" IS NOT NULL AND "heartbeatAt" IS NOT NULL
    )
  ),
  CONSTRAINT "RegistryMutationOperation_ambiguous_has_timestamp" CHECK (
    "state" <> 'AMBIGUOUS' OR "ambiguousAt" IS NOT NULL
  ),
  CONSTRAINT "RegistryMutationOperation_verified_has_timestamp" CHECK (
    "state" <> 'VERIFIED' OR ("verifiedAt" IS NOT NULL AND "providerEvidence" IS NOT NULL)
  ),
  CONSTRAINT "RegistryMutationOperation_failed_safe_is_recovered" CHECK (
    "state" <> 'FAILED_SAFE' OR ("recoveredAt" IS NOT NULL AND "recoveryEvidence" IS NOT NULL)
  ),
  CONSTRAINT "RegistryMutationOperation_recovery_is_audited" CHECK (
    ("recoveredAt" IS NULL AND "recoveryEvidence" IS NULL) OR ((
      "recoveredAt" IS NOT NULL AND
      "recoveryEvidence" IS NOT NULL
      AND "recoveryEvidence"->>'schemaVersion' = 'registry-mutation-recovery-v1'
      AND "recoveryEvidence"->>'resolution' = "state"::text
      AND "recoveryEvidence"->>'operatorUserId' <> ''
      AND "recoveryEvidence"->>'auditEventId' <> ''
      AND "recoveryEvidence"->>'operationId' = "id"
      AND "recoveryEvidence"->>'projectId' = "projectId"
      AND "recoveryEvidence"->>'organizationId' = "organizationId"
      AND "recoveryEvidence"->>'intentHash' = "intentHash"
      AND "recoveryEvidence"->>'observationWindowStartedAt' IS NOT NULL
      AND "recoveryEvidence"->>'observationWindowEndedAt' IS NOT NULL
      AND ("recoveryEvidence"->>'observationWindowStartedAt')::timestamptz
        >= "ambiguousAt" AT TIME ZONE 'UTC'
      AND ("recoveryEvidence"->>'observationWindowStartedAt')::timestamptz
        < ("recoveryEvidence"->>'observationWindowEndedAt')::timestamptz
      AND ("recoveryEvidence"->>'observationWindowEndedAt')::timestamptz
        <= "recoveredAt" AT TIME ZONE 'UTC'
      AND jsonb_typeof("recoveryEvidence"->'providerQueries') = 'array'
      AND jsonb_array_length("recoveryEvidence"->'providerQueries') BETWEEN 2 AND 16
      AND (
        (
          "state" = 'VERIFIED'::"RegistryMutationState"
          AND "providerEvidence" IS NOT NULL
          AND "recoveryEvidence"->>'providerEvidenceHash' ~ '^sha256:[a-f0-9]{64}$'
          AND jsonb_array_length(
            jsonb_path_query_array(
              "recoveryEvidence",
              '$.providerQueries[*] ? (@.result == "MATCHED_EFFECT")'
            )
          ) = jsonb_array_length("recoveryEvidence"->'providerQueries')
        ) OR (
          "state" = 'FAILED_SAFE'::"RegistryMutationState"
          AND "providerOperationId" IS NULL
          AND "providerEvidence" IS NULL
          AND NOT ("recoveryEvidence" ? 'providerEvidenceHash')
          AND jsonb_array_length(
            jsonb_path_query_array(
              "recoveryEvidence",
              '$.providerQueries[*] ? (@.result == "ABSENT")'
            )
          ) = jsonb_array_length("recoveryEvidence"->'providerQueries')
        )
      )
    ) IS TRUE)
  )
);

CREATE INDEX "RegistryMutationOperation_projectId_state_createdAt_idx"
  ON "RegistryMutationOperation"("projectId", "state", "createdAt");
CREATE INDEX "RegistryMutationOperation_state_leaseExpiresAt_idx"
  ON "RegistryMutationOperation"("state", "leaseExpiresAt");
CREATE INDEX "RegistryMutationOperation_providerOperationId_idx"
  ON "RegistryMutationOperation"("providerOperationId");

CREATE FUNCTION "guard_registry_mutation_operation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  repository JSONB;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(
    NEW."id", NEW."projectId", NEW."organizationId", NEW."ownershipEpoch",
    NEW."kind", NEW."repositories", NEW."intentHash", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."projectId", OLD."organizationId", OLD."ownershipEpoch",
    OLD."kind", OLD."repositories", OLD."intentHash", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'REGISTRY_MUTATION_INTENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  FOR repository IN SELECT value FROM jsonb_array_elements(NEW."repositories") LOOP
    IF jsonb_typeof(repository) <> 'string'
       OR regexp_count(repository #>> '{}', '/') <> 3
       OR right(repository #>> '{}', length('/p-' || lower(NEW."projectId"))) <> '/p-' || lower(NEW."projectId") THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_PROJECT_PACKAGE_INVALID' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."fencingToken" < OLD."fencingToken" THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_FENCE_REGRESSION' USING ERRCODE = '23514';
    END IF;
    IF OLD."providerOperationId" IS NOT NULL
       AND NEW."providerOperationId" IS DISTINCT FROM OLD."providerOperationId" THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_PROVIDER_ID_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF OLD."recoveryEvidence" IS NOT NULL
       AND NEW."recoveryEvidence" IS DISTINCT FROM OLD."recoveryEvidence" THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_RECOVERY_EVIDENCE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
      (OLD."state" = 'PREPARED' AND NEW."state" = 'IN_FLIGHT') OR
      (OLD."state" = 'IN_FLIGHT' AND NEW."state" IN ('VERIFIED', 'AMBIGUOUS')) OR
      (OLD."state" = 'AMBIGUOUS' AND NEW."state" IN ('VERIFIED', 'FAILED_SAFE')
        AND NEW."recoveredAt" IS NOT NULL AND NEW."recoveryEvidence" IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_STATE_TRANSITION_INVALID' USING ERRCODE = '23514';
    END IF;
    IF OLD."state" IN ('VERIFIED', 'FAILED_SAFE') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_TERMINAL_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "RegistryMutationOperation_guard_write"
BEFORE INSERT OR UPDATE ON "RegistryMutationOperation"
FOR EACH ROW EXECUTE FUNCTION "guard_registry_mutation_operation"();

-- A direct account-purge cascade must not discover the RESTRICT FKs as an
-- opaque provider error. The shared image-erasure coordinator removes these
-- rows only after its canonical sub-receipt is verified in the parent
-- PROJECT_PERMANENT_DELETE operation.
CREATE FUNCTION "guard_project_image_lifecycle_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AppImageBuildOperation" WHERE "projectId" = OLD."id")
     OR EXISTS (SELECT 1 FROM "RegistryMutationOperation" WHERE "projectId" = OLD."id") THEN
    RAISE EXCEPTION 'PROJECT_IMAGE_ERASURE_RECEIPT_REQUIRED' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "Project_image_lifecycle_delete_guard"
BEFORE DELETE ON "Project"
FOR EACH ROW EXECUTE FUNCTION "guard_project_image_lifecycle_delete"();

CREATE FUNCTION "guard_server_release_project_package"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_repo TEXT;
  target_repo TEXT;
BEGIN
  IF NEW."artifactKind" <> 'server-image' THEN
    RETURN NEW;
  END IF;
  IF regexp_count(NEW."artifactRef", '/') <> 3
     OR right(NEW."artifactRef", length('/p-' || lower(NEW."projectId"))) <> '/p-' || lower(NEW."projectId") THEN
    RAISE EXCEPTION 'SERVER_RELEASE_CROSS_PROJECT_PACKAGE_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  IF NEW."promotionEvidence" IS NOT NULL THEN
    source_repo := NEW."promotionEvidence" #>> '{promotion,sourceRepo}';
    target_repo := NEW."promotionEvidence" #>> '{promotion,targetRepo}';
    IF source_repo IS NULL OR target_repo IS NULL
       OR regexp_count(source_repo, '/') <> 3 OR regexp_count(target_repo, '/') <> 3
       OR right(source_repo, length('/p-' || lower(NEW."projectId"))) <> '/p-' || lower(NEW."projectId")
       OR right(target_repo, length('/p-' || lower(NEW."projectId"))) <> '/p-' || lower(NEW."projectId") THEN
      RAISE EXCEPTION 'SERVER_RELEASE_PROMOTION_CROSS_PROJECT_PACKAGE_FORBIDDEN' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Do not grandfather a cross-project last reference: it would make exact
-- package GC impossible while presenting the new invariant as active.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ReleaseManifest"
    WHERE "artifactKind" = 'server-image'
      AND (
        regexp_count("artifactRef", '/') <> 3
        OR right("artifactRef", length('/p-' || lower("projectId"))) <> '/p-' || lower("projectId")
        OR (
          "promotionEvidence" IS NOT NULL
          AND (
            "promotionEvidence" #>> '{promotion,sourceRepo}' IS NULL
            OR "promotionEvidence" #>> '{promotion,targetRepo}' IS NULL
            OR regexp_count("promotionEvidence" #>> '{promotion,sourceRepo}', '/') <> 3
            OR regexp_count("promotionEvidence" #>> '{promotion,targetRepo}', '/') <> 3
            OR right(
              "promotionEvidence" #>> '{promotion,sourceRepo}',
              length('/p-' || lower("projectId"))
            ) <> '/p-' || lower("projectId")
            OR right(
              "promotionEvidence" #>> '{promotion,targetRepo}',
              length('/p-' || lower("projectId"))
            ) <> '/p-' || lower("projectId")
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'SERVER_RELEASE_CROSS_PROJECT_PACKAGE_PREEXISTS' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TRIGGER "ReleaseManifest_project_package_guard"
BEFORE INSERT OR UPDATE ON "ReleaseManifest"
FOR EACH ROW EXECUTE FUNCTION "guard_server_release_project_package"();
