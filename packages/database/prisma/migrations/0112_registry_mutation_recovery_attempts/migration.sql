-- Durable retry identity and relational operator audit for registry mutations.
-- A FAILED_SAFE project erasure can be retried under a new attempt/fence only
-- after a caller-owned verify-first pass while the package locks are held.

ALTER TABLE "RegistryMutationOperation"
  ADD COLUMN "attemptNumber" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "attemptId" TEXT;

UPDATE "RegistryMutationOperation"
SET "attemptNumber" = GREATEST("fencingToken", 1),
    "attemptId" = "id" || ':attempt:' || GREATEST("fencingToken", 1)::text
      || ':fence:' || "fencingToken"::text
WHERE "state" <> 'PREPARED'::"RegistryMutationState";

CREATE TABLE "RegistryMutationRecovery" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "attemptNumber" BIGINT NOT NULL,
  "resolution" "RegistryMutationState" NOT NULL,
  "auditLogId" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistryMutationRecovery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistryMutationRecovery_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "RegistryMutationOperation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RegistryMutationRecovery_auditLogId_fkey"
    FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RegistryMutationRecovery_resolution_valid" CHECK (
    "resolution" IN (
      'MANUAL_RECOVERY'::"RegistryMutationState",
      'VERIFIED'::"RegistryMutationState",
      'FAILED_SAFE'::"RegistryMutationState"
    )
  ),
  CONSTRAINT "RegistryMutationRecovery_evidence_bound" CHECK ((
    "evidence"->>'schemaVersion' = 'registry-mutation-recovery-v2'
    AND "evidence"->>'operationId' = "operationId"
    AND "evidence"->>'attemptNumber' = "attemptNumber"::text
    AND "evidence"->>'resolution' = "resolution"::text
    AND "evidence"->>'auditLogId' = "auditLogId"
  ) IS TRUE)
);

CREATE UNIQUE INDEX "RegistryMutationRecovery_auditLogId_key"
  ON "RegistryMutationRecovery"("auditLogId");
CREATE UNIQUE INDEX "RegistryMutationRecovery_operationId_attemptNumber_resolution_key"
  ON "RegistryMutationRecovery"("operationId", "attemptNumber", "resolution");
CREATE INDEX "RegistryMutationRecovery_operationId_createdAt_idx"
  ON "RegistryMutationRecovery"("operationId", "createdAt");

DROP TRIGGER IF EXISTS "RegistryMutationOperation_guard_write" ON "RegistryMutationOperation";
DROP FUNCTION IF EXISTS "guard_registry_mutation_operation"();

ALTER TABLE "RegistryMutationOperation"
  DROP CONSTRAINT IF EXISTS "RegistryMutationOperation_active_has_owner",
  DROP CONSTRAINT IF EXISTS "RegistryMutationOperation_ambiguous_has_timestamp",
  DROP CONSTRAINT IF EXISTS "RegistryMutationOperation_verified_has_timestamp",
  DROP CONSTRAINT IF EXISTS "RegistryMutationOperation_failed_safe_is_recovered",
  DROP CONSTRAINT IF EXISTS "RegistryMutationOperation_recovery_is_audited";

-- Preserve any recovery written by the previous schema. It was not linked to
-- AuditLog, so create a migration audit row and bind the upgraded v2 evidence
-- to it. New writes always carry the authenticated operator as actorUserId.
INSERT INTO "AuditLog" (
  "id", "organizationId", "actorUserId", "action", "resourceType",
  "resourceId", "metadata", "createdAt"
)
SELECT
  'registry-recovery-audit-' || md5(operation."id" || operation."recoveredAt"::text),
  operation."organizationId",
  NULL,
  'registry.mutation.recovery.migrated',
  'registryMutationOperation',
  operation."id",
  jsonb_build_object(
    'legacyOperatorUserId', operation."recoveryEvidence"->>'operatorUserId',
    'legacyAuditEventId', operation."recoveryEvidence"->>'auditEventId',
    'resolution', operation."state"::text,
    'attemptNumber', operation."attemptNumber"::text
  ),
  operation."recoveredAt"
FROM "RegistryMutationOperation" AS operation
WHERE operation."recoveredAt" IS NOT NULL
  AND operation."recoveryEvidence" IS NOT NULL;

UPDATE "RegistryMutationOperation" AS operation
SET "recoveryEvidence" =
  (operation."recoveryEvidence" - 'auditEventId' - 'schemaVersion')
  || jsonb_build_object(
    'schemaVersion', 'registry-mutation-recovery-v2',
    'auditLogId', 'registry-recovery-audit-' || md5(operation."id" || operation."recoveredAt"::text),
    'attemptId', operation."attemptId",
    'attemptNumber', operation."attemptNumber"::text,
    'fencingToken', operation."fencingToken"::text
  )
WHERE operation."recoveredAt" IS NOT NULL
  AND operation."recoveryEvidence" IS NOT NULL;

INSERT INTO "RegistryMutationRecovery" (
  "id", "operationId", "attemptNumber", "resolution", "auditLogId", "evidence", "createdAt"
)
SELECT
  'registry-recovery-record-' || md5(operation."id" || operation."recoveredAt"::text),
  operation."id",
  operation."attemptNumber",
  operation."state",
  operation."recoveryEvidence"->>'auditLogId',
  operation."recoveryEvidence",
  operation."recoveredAt"
FROM "RegistryMutationOperation" AS operation
WHERE operation."recoveredAt" IS NOT NULL
  AND operation."recoveryEvidence" IS NOT NULL;

ALTER TABLE "RegistryMutationOperation"
  ADD CONSTRAINT "RegistryMutationOperation_attempt_identity_valid" CHECK ((
    (
      "state" = 'PREPARED'::"RegistryMutationState"
      AND "attemptNumber" = 0
      AND "attemptId" IS NULL
      AND "fencingToken" = 0
    ) OR (
      "state" <> 'PREPARED'::"RegistryMutationState"
      AND "attemptNumber" > 0
      AND "attemptId" = "id" || ':attempt:' || "attemptNumber"::text
        || ':fence:' || "fencingToken"::text
    )
  ) IS TRUE),
  ADD CONSTRAINT "RegistryMutationOperation_active_has_owner" CHECK (
    "state" <> 'IN_FLIGHT'::"RegistryMutationState" OR (
      "ownerToken" IS NOT NULL
      AND "leaseExpiresAt" IS NOT NULL
      AND "backendPid" IS NOT NULL
      AND "attemptId" IS NOT NULL
      AND "effectStartedAt" IS NOT NULL
      AND "heartbeatAt" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "RegistryMutationOperation_ambiguous_has_timestamp" CHECK (
    "state" <> 'AMBIGUOUS'::"RegistryMutationState" OR "ambiguousAt" IS NOT NULL
  ),
  ADD CONSTRAINT "RegistryMutationOperation_manual_has_recovery" CHECK (
    "state" <> 'MANUAL_RECOVERY'::"RegistryMutationState" OR (
      "ambiguousAt" IS NOT NULL AND "recoveredAt" IS NOT NULL AND "recoveryEvidence" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "RegistryMutationOperation_verified_has_timestamp" CHECK (
    "state" <> 'VERIFIED'::"RegistryMutationState" OR (
      "verifiedAt" IS NOT NULL AND "providerEvidence" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "RegistryMutationOperation_failed_safe_is_recovered" CHECK (
    "state" <> 'FAILED_SAFE'::"RegistryMutationState" OR (
      "recoveredAt" IS NOT NULL AND "recoveryEvidence" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "RegistryMutationOperation_recovery_is_audited" CHECK (
    ("recoveredAt" IS NULL AND "recoveryEvidence" IS NULL) OR ((
      "recoveredAt" IS NOT NULL
      AND "recoveryEvidence" IS NOT NULL
      AND "recoveryEvidence"->>'schemaVersion' = 'registry-mutation-recovery-v2'
      AND "recoveryEvidence"->>'resolution' = "state"::text
      AND "recoveryEvidence"->>'operatorUserId' <> ''
      AND "recoveryEvidence"->>'auditLogId' <> ''
      AND "recoveryEvidence"->>'operationId' = "id"
      AND "recoveryEvidence"->>'projectId' = "projectId"
      AND "recoveryEvidence"->>'organizationId' = "organizationId"
      AND "recoveryEvidence"->>'intentHash' = "intentHash"
      AND "recoveryEvidence"->>'attemptId' = "attemptId"
      AND "recoveryEvidence"->>'attemptNumber' = "attemptNumber"::text
      AND "recoveryEvidence"->>'fencingToken' = "fencingToken"::text
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
      AND jsonb_array_length(
        jsonb_path_query_array(
          "recoveryEvidence",
          '$.providerQueries[*] ? (@.result == "ABSENT" || @.result == "MATCHED_EFFECT" || @.result == "UNRESOLVED")'
        )
      ) = jsonb_array_length("recoveryEvidence"->'providerQueries')
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
        ) OR (
          "state" = 'MANUAL_RECOVERY'::"RegistryMutationState"
          AND NOT ("recoveryEvidence" ? 'providerEvidenceHash')
          AND jsonb_array_length(
            jsonb_path_query_array(
              "recoveryEvidence",
              '$.providerQueries[*] ? (@.result == "UNRESOLVED")'
            )
          ) > 0
        )
      )
    ) IS TRUE)
  );

CREATE OR REPLACE FUNCTION "guard_registry_mutation_operation"()
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
    IF OLD."providerOperationId" IS NOT NULL
       AND NEW."providerOperationId" IS DISTINCT FROM OLD."providerOperationId" THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_PROVIDER_ID_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF NEW."state" IS DISTINCT FROM OLD."state" AND NOT (
      (OLD."state" = 'PREPARED'::"RegistryMutationState"
        AND NEW."state" = 'IN_FLIGHT'::"RegistryMutationState") OR
      (OLD."state" = 'IN_FLIGHT'::"RegistryMutationState"
        AND NEW."state" IN ('VERIFIED'::"RegistryMutationState", 'AMBIGUOUS'::"RegistryMutationState")) OR
      (OLD."state" = 'AMBIGUOUS'::"RegistryMutationState"
        AND NEW."state" IN (
          'MANUAL_RECOVERY'::"RegistryMutationState",
          'VERIFIED'::"RegistryMutationState",
          'FAILED_SAFE'::"RegistryMutationState"
        )
        AND NEW."recoveredAt" IS NOT NULL AND NEW."recoveryEvidence" IS NOT NULL) OR
      (OLD."state" = 'MANUAL_RECOVERY'::"RegistryMutationState"
        AND NEW."state" IN ('VERIFIED'::"RegistryMutationState", 'FAILED_SAFE'::"RegistryMutationState")
        AND NEW."recoveredAt" IS NOT NULL AND NEW."recoveryEvidence" IS NOT NULL) OR
      (OLD."state" = 'FAILED_SAFE'::"RegistryMutationState"
        AND OLD."kind" = 'PROJECT_ERASURE'::"RegistryMutationKind"
        AND NEW."state" = 'IN_FLIGHT'::"RegistryMutationState"
        AND NEW."recoveredAt" IS NULL AND NEW."recoveryEvidence" IS NULL)
    ) THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_STATE_TRANSITION_INVALID' USING ERRCODE = '23514';
    END IF;

    IF NEW."state" = 'IN_FLIGHT'::"RegistryMutationState"
       AND OLD."state" IN ('PREPARED'::"RegistryMutationState", 'FAILED_SAFE'::"RegistryMutationState") THEN
      IF NEW."attemptNumber" <> OLD."attemptNumber" + 1
         OR NEW."fencingToken" <> OLD."fencingToken" + 1
         OR NEW."attemptId" <> NEW."id" || ':attempt:' || NEW."attemptNumber"::text
           || ':fence:' || NEW."fencingToken"::text THEN
        RAISE EXCEPTION 'REGISTRY_MUTATION_ATTEMPT_IDENTITY_INVALID' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber"
       OR NEW."attemptId" IS DISTINCT FROM OLD."attemptId"
       OR NEW."fencingToken" IS DISTINCT FROM OLD."fencingToken" THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_ATTEMPT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF NEW."recoveryEvidence" IS DISTINCT FROM OLD."recoveryEvidence" THEN
      IF NEW."recoveryEvidence" IS NULL
         AND OLD."state" = 'FAILED_SAFE'::"RegistryMutationState"
         AND NEW."state" = 'IN_FLIGHT'::"RegistryMutationState" THEN
        NULL;
      ELSIF OLD."state" IN ('AMBIGUOUS'::"RegistryMutationState", 'MANUAL_RECOVERY'::"RegistryMutationState")
        AND NEW."state" IN (
          'MANUAL_RECOVERY'::"RegistryMutationState",
          'VERIFIED'::"RegistryMutationState",
          'FAILED_SAFE'::"RegistryMutationState"
        )
        AND EXISTS (
          SELECT 1
          FROM "RegistryMutationRecovery" AS recovery
          WHERE recovery."operationId" = NEW."id"
            AND recovery."attemptNumber" = NEW."attemptNumber"
            AND recovery."resolution" = NEW."state"
            AND recovery."auditLogId" = NEW."recoveryEvidence"->>'auditLogId'
            AND recovery."evidence" = NEW."recoveryEvidence"
        ) THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'REGISTRY_MUTATION_RECOVERY_EVIDENCE_INVALID' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF OLD."state" = 'VERIFIED'::"RegistryMutationState" AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_VERIFIED_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF OLD."state" = 'MANUAL_RECOVERY'::"RegistryMutationState"
       AND NEW."state" = OLD."state" AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_MANUAL_RECOVERY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF OLD."state" = 'FAILED_SAFE'::"RegistryMutationState"
       AND NOT (
         NEW."state" = 'IN_FLIGHT'::"RegistryMutationState"
         AND OLD."kind" = 'PROJECT_ERASURE'::"RegistryMutationKind"
       )
       AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'REGISTRY_MUTATION_FAILED_SAFE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "RegistryMutationOperation_guard_write"
BEFORE INSERT OR UPDATE ON "RegistryMutationOperation"
FOR EACH ROW EXECUTE FUNCTION "guard_registry_mutation_operation"();

CREATE OR REPLACE FUNCTION "guard_registry_mutation_recovery_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'REGISTRY_MUTATION_RECOVERY_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "RegistryMutationRecovery_guard_update"
BEFORE UPDATE ON "RegistryMutationRecovery"
FOR EACH ROW EXECUTE FUNCTION "guard_registry_mutation_recovery_update"();
