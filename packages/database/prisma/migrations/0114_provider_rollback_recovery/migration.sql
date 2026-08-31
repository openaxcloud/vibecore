-- Durable recovery for provider rollbacks. Vercel, Netlify and Cloudflare do
-- not document an idempotency key for their traffic-switch APIs, so a crashed
-- executor must observe the provider's live routing state and must never issue
-- a blind second POST.
ALTER TABLE "RollbackIdempotencyRequest"
  ADD COLUMN "operationKind" TEXT NOT NULL DEFAULT 'RELEASE_HISTORY',
  ADD COLUMN "sourceDeploymentId" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerDeploymentId" TEXT,
  ADD COLUMN "providerTarget" TEXT,
  ADD COLUMN "providerEffectState" TEXT,
  ADD COLUMN "providerResponseStatus" INTEGER,
  ADD COLUMN "providerResponseEvidence" JSONB,
  ADD COLUMN "providerRecoveryEvidence" JSONB,
  ADD COLUMN "providerEffectStartedAt" TIMESTAMP(3),
  ADD COLUMN "providerEffectResolvedAt" TIMESTAMP(3);

ALTER TABLE "RollbackIdempotencyRequest"
  DROP CONSTRAINT "RollbackIdempotencyRequest_target_shape_check",
  DROP CONSTRAINT "RollbackIdempotencyRequest_phase_check",
  DROP CONSTRAINT "RollbackIdempotencyRequest_effect_fence_check";

ALTER TABLE "RollbackIdempotencyRequest"
  ADD CONSTRAINT "RollbackIdempotencyRequest_phase_check"
    CHECK (
      "phase" IN (
        'CLAIMED', 'TARGET_BOUND', 'DEPLOYMENT_CREATED',
        'EFFECT_STARTED', 'EFFECT_CLEANED', 'RELEASE_COMMITTED',
        'PROVIDER_SUPERSEDED'
      )
    ),
  ADD CONSTRAINT "RollbackIdempotencyRequest_effect_fence_check" CHECK (
    (
      "phase" IN ('CLAIMED', 'TARGET_BOUND', 'DEPLOYMENT_CREATED')
      AND "effectFencingToken" IS NULL
    )
    OR
    (
      "phase" IN ('EFFECT_STARTED', 'EFFECT_CLEANED', 'RELEASE_COMMITTED', 'PROVIDER_SUPERSEDED')
      AND "effectFencingToken" IS NOT NULL
      AND "effectFencingToken" > 0
      AND "effectFencingToken" <= "fencingToken"
    )
  ),
  ADD CONSTRAINT "RollbackIdempotencyRequest_operation_kind_check"
    CHECK ("operationKind" IN ('RELEASE_HISTORY', 'PROVIDER')),
  ADD CONSTRAINT "RollbackIdempotencyRequest_provider_name_check"
    CHECK ("provider" IS NULL OR "provider" IN ('vercel', 'netlify', 'cloudflare-pages')),
  ADD CONSTRAINT "RollbackIdempotencyRequest_provider_effect_state_check"
    CHECK (
      "providerEffectState" IS NULL OR "providerEffectState" IN (
        'PENDING', 'DISPATCHING', 'ACCEPTED', 'REJECTED', 'AMBIGUOUS',
        'MANUAL_RECOVERY', 'OBSERVED_TARGET', 'COMMITTED', 'SUPERSEDED'
      )
    ),
  ADD CONSTRAINT "RollbackIdempotencyRequest_provider_response_status_check"
    CHECK ("providerResponseStatus" IS NULL OR "providerResponseStatus" BETWEEN 100 AND 599),
  ADD CONSTRAINT "RollbackIdempotencyRequest_target_shape_check" CHECK (
    (
      "phase" = 'CLAIMED'
      AND "deploymentId" IS NULL
      AND "sourceDeploymentId" IS NULL
      AND "expectedHeadVersion" IS NULL
      AND "previousManifestId" IS NULL
      AND "projectManifestDigest" IS NULL
      AND "provider" IS NULL
      AND "providerDeploymentId" IS NULL
      AND "providerTarget" IS NULL
      AND "providerEffectState" IS NULL
    )
    OR
    (
      "phase" <> 'CLAIMED'
      AND "operationKind" = 'RELEASE_HISTORY'
      AND nullif("deploymentId", '') IS NOT NULL
      AND "sourceDeploymentId" IS NULL
      AND "expectedHeadVersion" IS NOT NULL
      AND "expectedHeadVersion" >= 0
      AND nullif("previousManifestId", '') IS NOT NULL
      AND "projectManifestDigest" ~ '^sha256:[0-9a-f]{64}$'
      AND "provider" IS NULL
      AND "providerDeploymentId" IS NULL
      AND "providerTarget" IS NULL
      AND "providerEffectState" IS NULL
    )
    OR
    (
      "phase" <> 'CLAIMED'
      AND "operationKind" = 'PROVIDER'
      AND nullif("deploymentId", '') IS NOT NULL
      AND nullif("sourceDeploymentId", '') IS NOT NULL
      AND "expectedHeadVersion" IS NULL
      AND "previousManifestId" IS NULL
      AND "projectManifestDigest" ~ '^sha256:[0-9a-f]{64}$'
      AND "provider" IN ('vercel', 'netlify', 'cloudflare-pages')
      AND nullif("providerDeploymentId", '') IS NOT NULL
      AND nullif("providerTarget", '') IS NOT NULL
      AND "providerEffectState" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "RollbackIdempotencyRequest_provider_recovery_shape_check" CHECK (
    (
      "operationKind" = 'RELEASE_HISTORY'
      AND "providerResponseStatus" IS NULL
      AND "providerResponseEvidence" IS NULL
      AND "providerRecoveryEvidence" IS NULL
      AND "providerEffectStartedAt" IS NULL
      AND "providerEffectResolvedAt" IS NULL
    )
    OR
    (
      "operationKind" = 'PROVIDER'
      AND (
        (
          "phase" = 'CLAIMED'
          AND "providerEffectStartedAt" IS NULL
          AND "providerEffectResolvedAt" IS NULL
        )
        OR
        (
          "phase" IN ('TARGET_BOUND', 'DEPLOYMENT_CREATED')
          AND "providerEffectState" = 'PENDING'
          AND "providerEffectStartedAt" IS NULL
          AND "providerEffectResolvedAt" IS NULL
        )
        OR
        (
          "phase" = 'EFFECT_STARTED'
          AND "providerEffectStartedAt" IS NOT NULL
          AND "providerEffectResolvedAt" IS NULL
          AND "providerEffectState" IN (
            'DISPATCHING', 'ACCEPTED', 'REJECTED', 'AMBIGUOUS',
            'MANUAL_RECOVERY', 'OBSERVED_TARGET'
          )
        )
        OR
        ("phase" = 'RELEASE_COMMITTED' AND "providerEffectState" = 'COMMITTED' AND "providerEffectResolvedAt" IS NOT NULL)
        OR
        (
          "phase" = 'PROVIDER_SUPERSEDED'
          AND "providerEffectState" = 'SUPERSEDED'
          AND "providerEffectResolvedAt" IS NOT NULL
        )
      )
      AND ("providerRecoveryEvidence" IS NULL OR jsonb_typeof("providerRecoveryEvidence") = 'array')
      AND ("providerResponseEvidence" IS NULL OR jsonb_typeof("providerResponseEvidence") = 'object')
      AND (
        (
          "providerEffectState" IN ('PENDING', 'DISPATCHING')
          AND "providerResponseStatus" IS NULL
          AND "providerResponseEvidence" IS NULL
        )
        OR (
          "providerEffectState" IN ('ACCEPTED', 'REJECTED')
          AND "providerResponseStatus" IS NOT NULL
          AND "providerResponseEvidence" IS NOT NULL
        )
        OR (
          "providerEffectState" = 'AMBIGUOUS'
          AND "providerResponseEvidence" IS NOT NULL
        )
        OR "providerEffectState" IN ('MANUAL_RECOVERY', 'OBSERVED_TARGET', 'COMMITTED', 'SUPERSEDED')
      )
      AND (
        (
          "providerEffectState" IN ('PENDING', 'DISPATCHING', 'ACCEPTED', 'REJECTED', 'AMBIGUOUS')
          AND "providerRecoveryEvidence" IS NULL
        )
        OR (
          "providerEffectState" IN ('MANUAL_RECOVERY', 'OBSERVED_TARGET', 'COMMITTED', 'SUPERSEDED')
          AND jsonb_array_length("providerRecoveryEvidence") > 0
        )
      )
    )
  );

CREATE INDEX "RollbackIdempotencyRequest_provider_recovery_idx"
  ON "RollbackIdempotencyRequest"("provider", "providerEffectState", "updatedAt")
  WHERE "operationKind" = 'PROVIDER' AND "status" = 'IN_PROGRESS';

-- Completed receipts remain immutable, but the account-purge finalizer must
-- be able to detach the erased actor from a retained receipt in a shared
-- organization. Authorize only that single-column redaction while the same
-- user owns an ACTIVE durable purge plan with installed topology freezes.
CREATE OR REPLACE FUNCTION "rollbackIdempotencyProtectCompleted"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" = 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'In-progress RollbackIdempotencyRequest is immutable';
  END IF;

  IF OLD."status" <> 'COMPLETED' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "Project" WHERE "id" = OLD."projectId") THEN
      RAISE EXCEPTION 'Completed RollbackIdempotencyRequest is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."actorUserId" IS NOT NULL
    AND NEW."actorUserId" IS NULL
    AND (to_jsonb(NEW) - 'actorUserId') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'actorUserId')
    AND (
      NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = OLD."actorUserId")
      OR EXISTS (
        SELECT 1
        FROM "PurgePlan" purge_plan
        WHERE purge_plan."userId" = OLD."actorUserId"
          AND purge_plan."status" = 'ACTIVE'
          AND EXISTS (
            SELECT 1 FROM "PurgeFreeze" purge_freeze
            WHERE purge_freeze."planId" = purge_plan."id"
          )
      )
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Completed RollbackIdempotencyRequest is immutable';
END;
$$;

-- Provider intent and evidence are recovery authority, not mutable job state.
-- Permit only the forward saga edges used by the API, make the response
-- write-once, and require every observation update to append without rewriting
-- or removing any prior live-routing evidence.
CREATE FUNCTION "guard_provider_rollback_recovery_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous_recovery_length INTEGER;
  new_recovery_prefix JSONB;
BEGIN
  IF OLD."operationKind" IS DISTINCT FROM NEW."operationKind" THEN
    RAISE EXCEPTION 'PROVIDER_ROLLBACK_OPERATION_KIND_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."operationKind" <> 'PROVIDER' THEN
    RETURN NEW;
  END IF;

  IF (OLD."sourceDeploymentId" IS NOT NULL AND OLD."sourceDeploymentId" IS DISTINCT FROM NEW."sourceDeploymentId")
     OR (OLD."provider" IS NOT NULL AND OLD."provider" IS DISTINCT FROM NEW."provider")
     OR (OLD."providerDeploymentId" IS NOT NULL AND OLD."providerDeploymentId" IS DISTINCT FROM NEW."providerDeploymentId")
     OR (OLD."providerTarget" IS NOT NULL AND OLD."providerTarget" IS DISTINCT FROM NEW."providerTarget")
     OR (OLD."deploymentId" IS NOT NULL AND OLD."deploymentId" IS DISTINCT FROM NEW."deploymentId")
     OR (OLD."projectManifestDigest" IS NOT NULL AND OLD."projectManifestDigest" IS DISTINCT FROM NEW."projectManifestDigest") THEN
    RAISE EXCEPTION 'PROVIDER_ROLLBACK_TARGET_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."phase" IS DISTINCT FROM NEW."phase" AND NOT (
    (OLD."phase" = 'CLAIMED' AND NEW."phase" = 'TARGET_BOUND')
    OR (OLD."phase" = 'TARGET_BOUND' AND NEW."phase" = 'DEPLOYMENT_CREATED')
    OR (OLD."phase" = 'DEPLOYMENT_CREATED' AND NEW."phase" = 'EFFECT_STARTED')
    OR (OLD."phase" = 'EFFECT_STARTED' AND NEW."phase" = 'RELEASE_COMMITTED')
    OR (OLD."phase" = 'EFFECT_STARTED' AND NEW."phase" = 'PROVIDER_SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'PROVIDER_ROLLBACK_PHASE_REGRESSION' USING ERRCODE = '23514';
  END IF;

  IF OLD."providerEffectState" IS DISTINCT FROM NEW."providerEffectState" AND NOT (
    (OLD."providerEffectState" IS NULL AND NEW."providerEffectState" = 'PENDING')
    OR (OLD."providerEffectState" = 'PENDING' AND NEW."providerEffectState" = 'DISPATCHING')
    OR (
      OLD."providerEffectState" = 'DISPATCHING'
      AND NEW."providerEffectState" IN (
        'ACCEPTED', 'REJECTED', 'AMBIGUOUS', 'MANUAL_RECOVERY', 'OBSERVED_TARGET'
      )
    )
    OR (
      OLD."providerEffectState" IN (
        'ACCEPTED', 'REJECTED', 'AMBIGUOUS', 'MANUAL_RECOVERY', 'OBSERVED_TARGET'
      )
      AND NEW."providerEffectState" IN ('MANUAL_RECOVERY', 'OBSERVED_TARGET')
    )
    OR (OLD."providerEffectState" = 'OBSERVED_TARGET' AND NEW."providerEffectState" = 'COMMITTED')
    OR (OLD."providerEffectState" = 'MANUAL_RECOVERY' AND NEW."providerEffectState" = 'SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'PROVIDER_ROLLBACK_STATE_REGRESSION' USING ERRCODE = '23514';
  END IF;

  IF OLD."providerEffectStartedAt" IS NOT NULL
     AND OLD."providerEffectStartedAt" IS DISTINCT FROM NEW."providerEffectStartedAt" THEN
    RAISE EXCEPTION 'PROVIDER_ROLLBACK_EFFECT_START_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."providerEffectResolvedAt" IS NOT NULL
     AND OLD."providerEffectResolvedAt" IS DISTINCT FROM NEW."providerEffectResolvedAt" THEN
    RAISE EXCEPTION 'PROVIDER_ROLLBACK_EFFECT_RESOLUTION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."providerResponseStatus" IS DISTINCT FROM NEW."providerResponseStatus"
     OR OLD."providerResponseEvidence" IS DISTINCT FROM NEW."providerResponseEvidence" THEN
    IF OLD."providerEffectState" <> 'DISPATCHING'
       OR NEW."providerEffectState" NOT IN ('ACCEPTED', 'REJECTED', 'AMBIGUOUS')
       OR OLD."providerResponseStatus" IS NOT NULL
       OR OLD."providerResponseEvidence" IS NOT NULL THEN
      RAISE EXCEPTION 'PROVIDER_ROLLBACK_RESPONSE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD."providerRecoveryEvidence" IS DISTINCT FROM NEW."providerRecoveryEvidence" THEN
    IF NEW."providerRecoveryEvidence" IS NULL
       OR jsonb_typeof(NEW."providerRecoveryEvidence") <> 'array'
       OR NEW."providerEffectState" NOT IN ('MANUAL_RECOVERY', 'OBSERVED_TARGET') THEN
      RAISE EXCEPTION 'PROVIDER_ROLLBACK_RECOVERY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF OLD."providerRecoveryEvidence" IS NOT NULL THEN
      previous_recovery_length := jsonb_array_length(OLD."providerRecoveryEvidence");
      SELECT COALESCE(jsonb_agg(item.value ORDER BY item.ordinality), '[]'::jsonb)
        INTO new_recovery_prefix
      FROM jsonb_array_elements(NEW."providerRecoveryEvidence") WITH ORDINALITY AS item(value, ordinality)
      WHERE item.ordinality <= previous_recovery_length;

      IF jsonb_array_length(NEW."providerRecoveryEvidence") <= previous_recovery_length
         OR new_recovery_prefix IS DISTINCT FROM OLD."providerRecoveryEvidence" THEN
        RAISE EXCEPTION 'PROVIDER_ROLLBACK_RECOVERY_IMMUTABLE' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF OLD."providerEffectState" IS DISTINCT FROM NEW."providerEffectState"
        AND NEW."providerEffectState" IN ('MANUAL_RECOVERY', 'OBSERVED_TARGET') THEN
    RAISE EXCEPTION 'PROVIDER_ROLLBACK_OBSERVATION_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "RollbackIdempotencyRequest_provider_recovery_guard"
BEFORE UPDATE ON "RollbackIdempotencyRequest"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_rollback_recovery_transition"();

-- Parent-side defense in depth: the project FK is intentionally CASCADE for
-- completed receipts, but an in-progress rollback is external-effect authority
-- and may be the only durable proof that a provider accepted a traffic switch.
-- Refuse every direct delete/cascade entry point before PostgreSQL can remove it.
CREATE FUNCTION "guard_project_in_progress_rollback_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RollbackIdempotencyRequest"
    WHERE "projectId" = OLD."id" AND "status" = 'IN_PROGRESS'
  ) THEN
    RAISE EXCEPTION 'PROJECT_ROLLBACK_OPERATION_IN_PROGRESS' USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "Project_in_progress_rollback_delete_guard"
BEFORE DELETE ON "Project"
FOR EACH ROW EXECUTE FUNCTION "guard_project_in_progress_rollback_delete"();
