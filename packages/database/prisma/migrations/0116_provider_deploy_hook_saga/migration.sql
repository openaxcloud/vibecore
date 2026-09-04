-- External deployment hooks are single-attempt durable sagas. The immutable
-- provider intent is committed under a ProjectReleaseFence before the first
-- POST, and DISPATCHING is committed before network I/O. A lost response can
-- therefore never authorize a blind second POST.

CREATE TABLE "ProviderDeployHookTargetBinding" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "targetHash" TEXT NOT NULL,
  "targetSnapshot" JSONB NOT NULL,
  "dedicated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderDeployHookTargetBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderDeployHookTargetBinding_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookTargetBinding_provider_valid"
    CHECK ("provider" IN ('vercel', 'netlify', 'github-pages', 'cloudflare-pages', 'google-cloud-run', 'docker')),
  CONSTRAINT "ProviderDeployHookTargetBinding_hash_valid"
    CHECK ("targetHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "ProviderDeployHookTargetBinding_snapshot_valid"
    CHECK (jsonb_typeof("targetSnapshot") = 'object')
);

CREATE UNIQUE INDEX "ProviderDeployHookTargetBinding_provider_targetHash_key"
  ON "ProviderDeployHookTargetBinding"("provider", "targetHash");
CREATE UNIQUE INDEX "ProviderDeployHookTargetBinding_projectId_provider_key"
  ON "ProviderDeployHookTargetBinding"("projectId", "provider");
CREATE INDEX "ProviderDeployHookTargetBinding_projectId_createdAt_idx"
  ON "ProviderDeployHookTargetBinding"("projectId", "createdAt");

CREATE TABLE "ProviderDeployHookOperation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownershipEpoch" INTEGER NOT NULL,
  "actorUserId" TEXT,
  "intentKind" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "publishRegion" TEXT,
  "projectManifestDigest" TEXT NOT NULL,
  "targetBindingId" TEXT NOT NULL,
  "providerTargetHash" TEXT NOT NULL,
  "providerTargetSnapshot" JSONB NOT NULL,
  "providerTargetDedicated" BOOLEAN NOT NULL,
  "operationTag" TEXT NOT NULL,
  "intentHash" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'PREPARED',
  "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
  "providerBuildId" TEXT,
  "providerUrl" TEXT,
  "outcomeStatus" TEXT,
  "providerTerminalStatus" TEXT,
  "lastHttpStatus" INTEGER,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "manualRecoveryReason" TEXT,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatchCommittedAt" TIMESTAMP(3),
  "identifiedAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "manualRecoveryAt" TIMESTAMP(3),
  "decommissionedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderDeployHookOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderDeployHookOperation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookOperation_deploymentId_fkey"
    FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookOperation_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookOperation_targetBindingId_fkey"
    FOREIGN KEY ("targetBindingId") REFERENCES "ProviderDeployHookTargetBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookOperation_intent_kind_valid"
    CHECK ("intentKind" IN ('CREATE', 'REDEPLOY')),
  CONSTRAINT "ProviderDeployHookOperation_provider_valid"
    CHECK ("provider" IN ('vercel', 'netlify', 'github-pages', 'cloudflare-pages', 'google-cloud-run', 'docker')),
  CONSTRAINT "ProviderDeployHookOperation_operation_tag_valid"
    CHECK ("operationTag" ~ '^ecode-deploy-[a-f0-9]{40}$'),
  CONSTRAINT "ProviderDeployHookOperation_manifest_digest_valid"
    CHECK ("projectManifestDigest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "ProviderDeployHookOperation_target_hash_valid"
    CHECK ("providerTargetHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "ProviderDeployHookOperation_target_snapshot_valid"
    CHECK (jsonb_typeof("providerTargetSnapshot") = 'object'),
  CONSTRAINT "ProviderDeployHookOperation_intent_hash_valid"
    CHECK ("intentHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "ProviderDeployHookOperation_phase_valid"
    CHECK ("phase" IN ('PREPARED', 'DISPATCHING', 'IDENTIFIED', 'TERMINAL', 'MANUAL_RECOVERY')),
  CONSTRAINT "ProviderDeployHookOperation_attempt_count_valid"
    CHECK (
      ("phase" = 'PREPARED' AND "dispatchAttempts" = 0 AND "dispatchCommittedAt" IS NULL)
      OR
      ("phase" <> 'PREPARED' AND "dispatchAttempts" = 1 AND "dispatchCommittedAt" IS NOT NULL)
    ),
  CONSTRAINT "ProviderDeployHookOperation_identified_has_id"
    CHECK ("phase" <> 'IDENTIFIED' OR ("providerBuildId" IS NOT NULL AND "identifiedAt" IS NOT NULL)),
  CONSTRAINT "ProviderDeployHookOperation_terminal_has_proof"
    CHECK (
      "phase" <> 'TERMINAL' OR (
        "terminalAt" IS NOT NULL AND (
          (
            "outcomeStatus" = 'REJECTED'
            AND "providerTerminalStatus" = 'REJECTED'
            AND "providerBuildId" IS NULL
          ) OR (
            "outcomeStatus" = 'ACCEPTED'
            AND "providerBuildId" IS NOT NULL
            AND "providerTerminalStatus" IN ('READY', 'FAILED', 'CANCELED')
          ) OR (
            "outcomeStatus" = 'CANCELED'
            AND "providerTerminalStatus" = 'CANCELED'
            AND "decommissionedAt" IS NOT NULL
          )
        )
      )
    ),
  CONSTRAINT "ProviderDeployHookOperation_manual_has_reason"
    CHECK ("phase" <> 'MANUAL_RECOVERY' OR ("manualRecoveryReason" IS NOT NULL AND "manualRecoveryAt" IS NOT NULL)),
  CONSTRAINT "ProviderDeployHookOperation_http_status_valid"
    CHECK ("lastHttpStatus" IS NULL OR "lastHttpStatus" BETWEEN 100 AND 599)
);

CREATE UNIQUE INDEX "ProviderDeployHookOperation_deploymentId_key"
  ON "ProviderDeployHookOperation"("deploymentId");
CREATE UNIQUE INDEX "ProviderDeployHookOperation_operationTag_key"
  ON "ProviderDeployHookOperation"("operationTag");
CREATE INDEX "ProviderDeployHookOperation_projectId_phase_createdAt_idx"
  ON "ProviderDeployHookOperation"("projectId", "phase", "createdAt");
CREATE INDEX "ProviderDeployHookOperation_organizationId_phase_createdAt_idx"
  ON "ProviderDeployHookOperation"("organizationId", "phase", "createdAt");
CREATE INDEX "ProviderDeployHookOperation_provider_phase_createdAt_idx"
  ON "ProviderDeployHookOperation"("provider", "phase", "createdAt");
CREATE INDEX "ProviderDeployHookOperation_targetBindingId_phase_createdAt_idx"
  ON "ProviderDeployHookOperation"("targetBindingId", "phase", "createdAt");
-- A target-window recovery must never overlap another possibly-live hook.
CREATE UNIQUE INDEX "ProviderDeployHookOperation_nonterminal_target_key"
  ON "ProviderDeployHookOperation"("targetBindingId")
  WHERE "phase" <> 'TERMINAL';

CREATE TABLE "ProviderDeployHookAttempt" (
  "operationId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "attemptId" TEXT NOT NULL,
  "requestId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'DISPATCHING',
  "httpStatus" INTEGER,
  "providerBuildId" TEXT,
  "providerUrl" TEXT,
  "providerTerminalStatus" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "dispatchStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "ProviderDeployHookAttempt_pkey" PRIMARY KEY ("operationId", "attemptNumber"),
  CONSTRAINT "ProviderDeployHookAttempt_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "ProviderDeployHookOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookAttempt_number_valid" CHECK ("attemptNumber" = 1),
  CONSTRAINT "ProviderDeployHookAttempt_state_valid"
    CHECK ("state" IN ('DISPATCHING', 'IDENTIFIED', 'TERMINAL', 'MANUAL_RECOVERY')),
  CONSTRAINT "ProviderDeployHookAttempt_http_status_valid"
    CHECK ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599),
  CONSTRAINT "ProviderDeployHookAttempt_settled_shape_valid"
    CHECK (
      ("state" = 'DISPATCHING' AND "settledAt" IS NULL)
      OR
      ("state" <> 'DISPATCHING' AND "settledAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ProviderDeployHookAttempt_attemptId_key"
  ON "ProviderDeployHookAttempt"("attemptId");
CREATE INDEX "ProviderDeployHookAttempt_operationId_state_dispatchStartedAt_idx"
  ON "ProviderDeployHookAttempt"("operationId", "state", "dispatchStartedAt");

CREATE TABLE "ProviderDeployHookRecovery" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "providerBuildId" TEXT,
  "resolution" TEXT NOT NULL,
  "auditLogId" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderDeployHookRecovery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderDeployHookRecovery_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "ProviderDeployHookOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookRecovery_auditLogId_fkey"
    FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProviderDeployHookRecovery_attempt_number_valid" CHECK ("attemptNumber" = 1),
  CONSTRAINT "ProviderDeployHookRecovery_resolution_valid" CHECK ("resolution" IN ('IDENTIFIED', 'TERMINAL'))
);

CREATE UNIQUE INDEX "ProviderDeployHookRecovery_auditLogId_key"
  ON "ProviderDeployHookRecovery"("auditLogId");
CREATE UNIQUE INDEX "ProviderDeployHookRecovery_operationId_attemptNumber_key"
  ON "ProviderDeployHookRecovery"("operationId", "attemptNumber");
CREATE INDEX "ProviderDeployHookRecovery_operationId_createdAt_idx"
  ON "ProviderDeployHookRecovery"("operationId", "createdAt");

CREATE FUNCTION "guard_provider_deploy_hook_target_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_TARGET_BINDING_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "ProviderDeployHookOperation" operation
    WHERE operation."targetBindingId" = OLD."id"
      AND operation."phase" <> 'TERMINAL'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_TARGET_BINDING_IN_USE' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "ProviderDeployHookTargetBinding_guard_update"
BEFORE UPDATE ON "ProviderDeployHookTargetBinding"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_target_binding"();

CREATE TRIGGER "ProviderDeployHookTargetBinding_guard_delete"
BEFORE DELETE ON "ProviderDeployHookTargetBinding"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_target_binding"();

CREATE FUNCTION "guard_provider_deploy_hook_operation_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ProviderDeployHookTargetBinding" binding
    WHERE binding."id" = NEW."targetBindingId"
      AND binding."projectId" = NEW."projectId"
      AND binding."provider" = NEW."provider"
      AND binding."targetHash" = NEW."providerTargetHash"
      AND binding."targetSnapshot" = NEW."providerTargetSnapshot"
      AND binding."dedicated" = NEW."providerTargetDedicated"
    FOR SHARE
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_TARGET_BINDING_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProviderDeployHookOperation_guard_insert"
BEFORE INSERT ON "ProviderDeployHookOperation"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_operation_insert"();

CREATE FUNCTION "guard_provider_deploy_hook_operation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."id", NEW."projectId", NEW."deploymentId", NEW."organizationId", NEW."ownershipEpoch",
    NEW."intentKind", NEW."provider", NEW."publishRegion", NEW."projectManifestDigest",
    NEW."targetBindingId", NEW."providerTargetHash", NEW."providerTargetSnapshot", NEW."providerTargetDedicated",
    NEW."operationTag", NEW."intentHash", NEW."preparedAt", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."projectId", OLD."deploymentId", OLD."organizationId", OLD."ownershipEpoch",
    OLD."intentKind", OLD."provider", OLD."publishRegion", OLD."projectManifestDigest",
    OLD."targetBindingId", OLD."providerTargetHash", OLD."providerTargetSnapshot", OLD."providerTargetDedicated",
    OLD."operationTag", OLD."intentHash", OLD."preparedAt", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_INTENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId" AND NOT (
    OLD."phase" = 'TERMINAL' AND NEW."actorUserId" IS NULL
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ACTOR_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."providerBuildId" IS NOT NULL AND NEW."providerBuildId" IS DISTINCT FROM OLD."providerBuildId" THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_PROVIDER_ID_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."providerUrl" IS NOT NULL AND NEW."providerUrl" IS DISTINCT FROM OLD."providerUrl" THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_PROVIDER_URL_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW."phase" IS DISTINCT FROM OLD."phase" AND NOT (
    (OLD."phase" = 'PREPARED' AND NEW."phase" = 'DISPATCHING') OR
    (OLD."phase" = 'DISPATCHING' AND NEW."phase" IN ('IDENTIFIED', 'TERMINAL', 'MANUAL_RECOVERY')) OR
    (OLD."phase" = 'IDENTIFIED' AND NEW."phase" IN ('TERMINAL', 'MANUAL_RECOVERY')) OR
    (OLD."phase" = 'MANUAL_RECOVERY' AND NEW."phase" IN ('IDENTIFIED', 'TERMINAL'))
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_PHASE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD."phase" = 'TERMINAL' AND
     (to_jsonb(NEW) - 'actorUserId') IS DISTINCT FROM (to_jsonb(OLD) - 'actorUserId') THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_TERMINAL_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."phase" = 'MANUAL_RECOVERY' AND NEW."phase" IN ('IDENTIFIED', 'TERMINAL') AND NOT EXISTS (
    SELECT 1 FROM "ProviderDeployHookRecovery" recovery
    WHERE recovery."operationId" = OLD."id"
      AND recovery."attemptNumber" = 1
      AND recovery."providerBuildId" IS NOT DISTINCT FROM NEW."providerBuildId"
      AND recovery."resolution" = NEW."phase"
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_RECOVERY_PROOF_MISSING' USING ERRCODE = '23514';
  END IF;

  IF NEW."dispatchAttempts" < OLD."dispatchAttempts" OR NEW."dispatchAttempts" > 1 THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ATTEMPT_COUNT_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProviderDeployHookOperation_guard_update"
BEFORE UPDATE ON "ProviderDeployHookOperation"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_operation"();

CREATE FUNCTION "guard_provider_deploy_hook_attempt"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW."operationId", NEW."attemptNumber", NEW."attemptId", NEW."requestId", NEW."dispatchStartedAt"
  ) IS DISTINCT FROM ROW(
    OLD."operationId", OLD."attemptNumber", OLD."attemptId", OLD."requestId", OLD."dispatchStartedAt"
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ATTEMPT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."state" = 'TERMINAL' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ATTEMPT_SETTLED_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF OLD."state" = 'DISPATCHING' AND NEW."state" NOT IN ('IDENTIFIED', 'TERMINAL', 'MANUAL_RECOVERY') THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ATTEMPT_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD."state" = 'IDENTIFIED' AND NEW."state" NOT IN ('TERMINAL', 'MANUAL_RECOVERY') THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ATTEMPT_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD."state" = 'MANUAL_RECOVERY' AND NEW."state" NOT IN ('IDENTIFIED', 'TERMINAL') THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ATTEMPT_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF OLD."state" = 'MANUAL_RECOVERY' AND NEW."state" IN ('IDENTIFIED', 'TERMINAL') AND NOT EXISTS (
    SELECT 1 FROM "ProviderDeployHookRecovery" recovery
    WHERE recovery."operationId" = OLD."operationId"
      AND recovery."attemptNumber" = OLD."attemptNumber"
      AND recovery."providerBuildId" IS NOT DISTINCT FROM NEW."providerBuildId"
      AND recovery."resolution" = NEW."state"
  ) THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_RECOVERY_PROOF_MISSING' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProviderDeployHookAttempt_guard_update"
BEFORE UPDATE ON "ProviderDeployHookAttempt"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_attempt"();

CREATE FUNCTION "guard_provider_deploy_hook_attempt_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  operation_phase TEXT;
BEGIN
  SELECT "phase" INTO operation_phase
  FROM "ProviderDeployHookOperation"
  WHERE "id" = NEW."operationId"
  FOR UPDATE;

  IF operation_phase IS DISTINCT FROM 'PREPARED' THEN
    RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_ATTEMPT_INSERT_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProviderDeployHookAttempt_guard_insert"
BEFORE INSERT ON "ProviderDeployHookAttempt"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_attempt_insert"();

-- Defense in depth for every current/future hard-delete path. Cascades may
-- remove the ledger only after an exact provider terminal proof is durable.
CREATE FUNCTION "guard_provider_deploy_hook_parent_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'Deployment' THEN
    IF EXISTS (
      SELECT 1 FROM "ProviderDeployHookOperation" operation
      WHERE operation."deploymentId" = OLD."id"
        AND NOT (
          operation."phase" = 'TERMINAL' AND (
            (
              operation."outcomeStatus" = 'REJECTED'
              AND operation."providerTerminalStatus" = 'REJECTED'
              AND operation."providerBuildId" IS NULL
            ) OR (
              operation."outcomeStatus" = 'ACCEPTED'
              AND operation."providerBuildId" IS NOT NULL
              AND operation."providerTerminalStatus" IN ('READY', 'FAILED', 'CANCELED')
            ) OR (
              operation."outcomeStatus" = 'CANCELED'
              AND operation."providerTerminalStatus" = 'CANCELED'
              AND operation."decommissionedAt" IS NOT NULL
            )
          )
        )
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_NOT_TERMINAL' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM "ProviderDeployHookOperation" operation
      WHERE operation."projectId" = OLD."id"
        AND NOT (
          operation."phase" = 'TERMINAL' AND (
            (
              operation."outcomeStatus" = 'REJECTED'
              AND operation."providerTerminalStatus" = 'REJECTED'
              AND operation."providerBuildId" IS NULL
            ) OR (
              operation."outcomeStatus" = 'ACCEPTED'
              AND operation."providerBuildId" IS NOT NULL
              AND operation."providerTerminalStatus" IN ('READY', 'FAILED', 'CANCELED')
            ) OR (
              operation."outcomeStatus" = 'CANCELED'
              AND operation."providerTerminalStatus" = 'CANCELED'
              AND operation."decommissionedAt" IS NOT NULL
            )
          )
        )
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'PROVIDER_DEPLOY_HOOK_NOT_TERMINAL' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "Deployment_provider_deploy_hook_guard_delete"
BEFORE DELETE ON "Deployment"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_parent_delete"();

CREATE TRIGGER "Project_provider_deploy_hook_guard_delete"
BEFORE DELETE ON "Project"
FOR EACH ROW EXECUTE FUNCTION "guard_provider_deploy_hook_parent_delete"();
