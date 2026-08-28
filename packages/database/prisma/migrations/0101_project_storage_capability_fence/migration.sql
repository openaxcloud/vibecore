-- Durable tenant-transfer fence and provider-effect saga.
--
-- GCS bucket names are deterministic from Project.id. Deleting a bucket does
-- not permanently revoke an unexpired signed URL: recreating the same bucket
-- would make that capability usable again. Every issuer advances this exact
-- upper bound before returning a URL; transfer refuses while it is in the
-- future and while the bucket still exists.
ALTER TABLE "Project"
  ADD COLUMN "objectStorageCapabilityExpiresAt" TIMESTAMP(3),
  ADD COLUMN "permanentDeletionStartedAt" TIMESTAMP(3);

CREATE TYPE "ObjectStorageOperationKind" AS ENUM (
  'TENANT_MUTATION',
  'SIGNED_UPLOAD_CAPABILITY',
  'SIGNED_DOWNLOAD_CAPABILITY',
  'PROJECT_TRANSFER',
  'PROJECT_PERMANENT_DELETE',
  'PROJECT_REMIX_CLONE',
  'ACCOUNT_PURGE_ERASURE'
);

CREATE TYPE "ObjectStorageOperationStatus" AS ENUM (
  'PREPARED',
  'EFFECT_STARTED',
  'VERIFYING',
  'COMMITTED',
  'FAILED_SAFE',
  'MANUAL_RECOVERY'
);

CREATE TYPE "ObjectStorageCapabilityReservationStatus" AS ENUM (
  'RESERVED',
  'ISSUED'
);

CREATE TABLE "ObjectStorageOperation" (
  "id" TEXT NOT NULL,
  "kind" "ObjectStorageOperationKind" NOT NULL,
  "status" "ObjectStorageOperationStatus" NOT NULL DEFAULT 'PREPARED',
  "scopeHash" TEXT NOT NULL,
  "idempotencyScopeHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "preconditions" JSONB NOT NULL,
  "evidence" JSONB,
  "result" JSONB,
  "reservedCapabilityExpiresAt" TIMESTAMP(3),
  "ownerToken" TEXT,
  "fencingToken" BIGINT NOT NULL DEFAULT 1,
  "leaseExpiresAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectStartedAt" TIMESTAMP(3),
  "verificationStartedAt" TIMESTAMP(3),
  "committedAt" TIMESTAMP(3),
  "failedSafeAt" TIMESTAMP(3),
  "manualRecoveryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ObjectStorageOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ObjectStorageOperation_scopeHash_format_check"
    CHECK ("scopeHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ObjectStorageOperation_idempotencyScopeHash_format_check"
    CHECK ("idempotencyScopeHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ObjectStorageOperation_requestHash_format_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ObjectStorageOperation_idempotencyKey_check"
    CHECK (length("idempotencyKey") BETWEEN 1 AND 255),
  CONSTRAINT "ObjectStorageOperation_ownerToken_check"
    CHECK ("ownerToken" IS NULL OR length("ownerToken") BETWEEN 16 AND 255),
  CONSTRAINT "ObjectStorageOperation_attempts_check" CHECK ("attempts" > 0),
  CONSTRAINT "ObjectStorageOperation_fencingToken_check" CHECK ("fencingToken" > 0),
  CONSTRAINT "ObjectStorageOperation_error_bounds_check"
    CHECK (
      ("lastErrorCode" IS NULL OR length("lastErrorCode") <= 128)
      AND ("lastErrorMessage" IS NULL OR length("lastErrorMessage") <= 1000)
    ),
  CONSTRAINT "ObjectStorageOperation_json_bounds_check"
    CHECK (
      jsonb_typeof("payload") = 'object'
      AND pg_column_size("payload") <= 262144
      AND jsonb_typeof("preconditions") = 'object'
      AND pg_column_size("preconditions") <= 262144
      AND ("evidence" IS NULL OR pg_column_size("evidence") <= 262144)
      AND ("result" IS NULL OR pg_column_size("result") <= 262144)
    ),
  CONSTRAINT "ObjectStorageOperation_lease_state_check"
    CHECK (
      (
        "status" IN ('PREPARED', 'EFFECT_STARTED', 'VERIFYING')
        AND "ownerToken" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
      )
      OR (
        "status" IN ('COMMITTED', 'FAILED_SAFE', 'MANUAL_RECOVERY')
        AND "ownerToken" IS NULL
        AND "leaseExpiresAt" IS NULL
      )
    ),
  CONSTRAINT "ObjectStorageOperation_phase_timestamps_check"
    CHECK (
      ("effectStartedAt" IS NULL OR "effectStartedAt" >= "preparedAt")
      AND ("verificationStartedAt" IS NULL OR "effectStartedAt" IS NOT NULL)
      AND ("committedAt" IS NULL OR "verificationStartedAt" IS NOT NULL)
      AND ("status" <> 'PREPARED' OR "effectStartedAt" IS NULL)
      AND ("status" <> 'FAILED_SAFE' OR ("effectStartedAt" IS NULL AND "failedSafeAt" IS NOT NULL))
      AND ("status" <> 'COMMITTED' OR ("committedAt" IS NOT NULL AND "result" IS NOT NULL))
      AND ("status" <> 'MANUAL_RECOVERY' OR "manualRecoveryAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ObjectStorageOperation_idempotencyScopeHash_idempotencyKey_key"
  ON "ObjectStorageOperation"("idempotencyScopeHash", "idempotencyKey");
CREATE INDEX "ObjectStorageOperation_scopeHash_idx"
  ON "ObjectStorageOperation"("scopeHash");
CREATE INDEX "ObjectStorageOperation_status_leaseExpiresAt_idx"
  ON "ObjectStorageOperation"("status", "leaseExpiresAt");
CREATE INDEX "ObjectStorageOperation_kind_status_createdAt_idx"
  ON "ObjectStorageOperation"("kind", "status", "createdAt");
CREATE INDEX "ObjectStorageOperation_reservedCapabilityExpiresAt_idx"
  ON "ObjectStorageOperation"("reservedCapabilityExpiresAt");

CREATE TABLE "ObjectStorageOperationPinnedObject" (
  "operationId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "generation" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,

  CONSTRAINT "ObjectStorageOperationPinnedObject_pkey" PRIMARY KEY ("operationId", "ordinal"),
  CONSTRAINT "ObjectStorageOperationPinnedObject_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "ObjectStorageOperationPinnedObject_key_check" CHECK (length("key") BETWEEN 1 AND 1024),
  CONSTRAINT "ObjectStorageOperationPinnedObject_size_check" CHECK ("size" >= 0),
  CONSTRAINT "ObjectStorageOperationPinnedObject_generation_check" CHECK (length("generation") BETWEEN 1 AND 255),
  CONSTRAINT "ObjectStorageOperationPinnedObject_content_hash_check"
    CHECK (
      length("contentHash") BETWEEN 1 AND 520
      AND "contentHash" ~ '^(sha256|md5|crc32c):[^[:space:]]+$'
    ),
  CONSTRAINT "ObjectStorageOperationPinnedObject_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "ObjectStorageOperation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ObjectStorageOperationPinnedObject_operation_key_key"
  ON "ObjectStorageOperationPinnedObject"("operationId", "key");

CREATE TABLE "ObjectStorageCapabilityReservation" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "fencingToken" BIGINT NOT NULL,
  "authorizationTokenHash" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "objectKeyHash" TEXT NOT NULL,
  "reservedExpiresAt" TIMESTAMP(3) NOT NULL,
  "status" "ObjectStorageCapabilityReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "evidence" JSONB,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedAt" TIMESTAMP(3),

  CONSTRAINT "ObjectStorageCapabilityReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ObjectStorageCapabilityReservation_attempt_check" CHECK ("attempt" > 0),
  CONSTRAINT "ObjectStorageCapabilityReservation_fence_check" CHECK ("fencingToken" > 0),
  CONSTRAINT "ObjectStorageCapabilityReservation_authorization_hash_check"
    CHECK ("authorizationTokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ObjectStorageCapabilityReservation_method_check" CHECK ("method" IN ('GET', 'PUT')),
  CONSTRAINT "ObjectStorageCapabilityReservation_object_key_hash_check"
    CHECK ("objectKeyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ObjectStorageCapabilityReservation_issue_state_check"
    CHECK (("status" = 'RESERVED' AND "issuedAt" IS NULL) OR ("status" = 'ISSUED' AND "issuedAt" IS NOT NULL)),
  CONSTRAINT "ObjectStorageCapabilityReservation_evidence_bounds_check"
    CHECK (
      "evidence" IS NULL
      OR (jsonb_typeof("evidence") = 'object' AND pg_column_size("evidence") <= 262144)
    ),
  CONSTRAINT "ObjectStorageCapabilityReservation_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "ObjectStorageOperation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ObjectStorageCapabilityReservation_operation_attempt_key"
  ON "ObjectStorageCapabilityReservation"("operationId", "attempt");
CREATE UNIQUE INDEX "ObjectStorageCapabilityReservation_operation_fence_key"
  ON "ObjectStorageCapabilityReservation"("operationId", "fencingToken");
CREATE INDEX "ObjectStorageCapabilityReservation_status_reservedExpiresAt_idx"
  ON "ObjectStorageCapabilityReservation"("status", "reservedExpiresAt");
CREATE INDEX "ObjectStorageCapabilityReservation_objectKeyHash_reservedAt_idx"
  ON "ObjectStorageCapabilityReservation"("objectKeyHash", "reservedAt");

CREATE TABLE "ObjectStorageOperationProjectScope" (
  "operationId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "projectIdSnapshot" TEXT NOT NULL,
  "projectId" TEXT,
  "expectedOrganizationId" TEXT NOT NULL,
  "expectedDeletedAt" TIMESTAMP(3),
  "expectedPermanentDeletionStartedAt" TIMESTAMP(3),
  "deletionFenceDeletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ObjectStorageOperationProjectScope_pkey" PRIMARY KEY ("operationId", "ordinal"),
  CONSTRAINT "ObjectStorageOperationProjectScope_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "ObjectStorageOperationProjectScope_project_snapshot_check"
    CHECK (length("projectIdSnapshot") BETWEEN 1 AND 128),
  CONSTRAINT "ObjectStorageOperationProjectScope_expected_org_check"
    CHECK (length("expectedOrganizationId") BETWEEN 1 AND 128),
  CONSTRAINT "ObjectStorageOperationProjectScope_deletion_fence_pair_check"
    CHECK (
      ("expectedPermanentDeletionStartedAt" IS NULL)
      = ("deletionFenceDeletedAt" IS NULL)
    ),
  CONSTRAINT "ObjectStorageOperationProjectScope_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "ObjectStorageOperation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ObjectStorageOperationProjectScope_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ObjectStorageOperationProjectScope_operation_project_key"
  ON "ObjectStorageOperationProjectScope"("operationId", "projectIdSnapshot");
CREATE INDEX "ObjectStorageOperationProjectScope_projectId_idx"
  ON "ObjectStorageOperationProjectScope"("projectId");
CREATE INDEX "ObjectStorageOperationProjectScope_snapshot_createdAt_idx"
  ON "ObjectStorageOperationProjectScope"("projectIdSnapshot", "createdAt");
CREATE INDEX "ObjectStorageOperationProjectScope_expectedOrg_createdAt_idx"
  ON "ObjectStorageOperationProjectScope"("expectedOrganizationId", "createdAt");

-- There is intentionally no Project FK: the proof must outlive the row whose
-- provider data was irreversibly erased. The operation FK is RESTRICT so a
-- receipt cannot be orphaned by history cleanup.
CREATE TABLE "ProjectPermanentDeletionReceipt" (
  "projectId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "scopeHash" TEXT NOT NULL,
  "idempotencyScopeHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "capabilityUpperBoundAt" TIMESTAMP(3),
  "projectSnapshot" JSONB NOT NULL,
  "state" "ObjectStorageOperationStatus" NOT NULL DEFAULT 'COMMITTED',
  "proof" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectPermanentDeletionReceipt_pkey" PRIMARY KEY ("projectId"),
  CONSTRAINT "ProjectPermanentDeletionReceipt_operationId_key" UNIQUE ("operationId"),
  CONSTRAINT "ProjectPermanentDeletionReceipt_scopeHash_format_check"
    CHECK ("scopeHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ProjectPermanentDeletionReceipt_idempotencyScopeHash_format_check"
    CHECK ("idempotencyScopeHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ProjectPermanentDeletionReceipt_requestHash_format_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ProjectPermanentDeletionReceipt_idempotencyKey_check"
    CHECK (length("idempotencyKey") BETWEEN 1 AND 255),
  CONSTRAINT "ProjectPermanentDeletionReceipt_state_check"
    CHECK ("state" = 'COMMITTED'),
  CONSTRAINT "ProjectPermanentDeletionReceipt_json_bounds_check"
    CHECK (
      jsonb_typeof("projectSnapshot") = 'object'
      AND pg_column_size("projectSnapshot") <= 262144
      AND jsonb_typeof("proof") = 'object'
      AND pg_column_size("proof") <= 262144
      AND jsonb_typeof("result") = 'object'
      AND pg_column_size("result") <= 262144
    ),
  CONSTRAINT "ProjectPermanentDeletionReceipt_operationId_fkey"
    FOREIGN KEY ("operationId") REFERENCES "ObjectStorageOperation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectPermanentDeletionReceipt_idempotencyScopeHash_idempotencyKey_key"
  ON "ProjectPermanentDeletionReceipt"("idempotencyScopeHash", "idempotencyKey");
CREATE INDEX "ProjectPermanentDeletionReceipt_organizationId_deletedAt_idx"
  ON "ProjectPermanentDeletionReceipt"("organizationId", "deletedAt");
CREATE INDEX "ProjectPermanentDeletionReceipt_requestHash_idx"
  ON "ProjectPermanentDeletionReceipt"("requestHash");

CREATE FUNCTION "prevent_project_permanent_deletion_receipt_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ProjectPermanentDeletionReceipt is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ProjectPermanentDeletionReceipt_append_only"
BEFORE UPDATE OR DELETE ON "ProjectPermanentDeletionReceipt"
FOR EACH ROW
EXECUTE FUNCTION "prevent_project_permanent_deletion_receipt_mutation"();

CREATE FUNCTION "prevent_receipted_object_storage_history_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  operation_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'ObjectStorageOperation' THEN
    operation_id := OLD."id";
  ELSE
    operation_id := OLD."operationId";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ProjectPermanentDeletionReceipt" receipt
    WHERE receipt."operationId" = operation_id
  ) THEN
    RAISE EXCEPTION 'Receipted object-storage history is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "ObjectStorageOperation_receipted_history_guard"
BEFORE UPDATE OR DELETE ON "ObjectStorageOperation"
FOR EACH ROW
EXECUTE FUNCTION "prevent_receipted_object_storage_history_mutation"();

CREATE TRIGGER "ObjectStorageOperationProjectScope_receipted_history_guard"
BEFORE UPDATE OR DELETE ON "ObjectStorageOperationProjectScope"
FOR EACH ROW
EXECUTE FUNCTION "prevent_receipted_object_storage_history_mutation"();

CREATE TRIGGER "ObjectStorageOperationPinnedObject_receipted_history_guard"
BEFORE UPDATE OR DELETE ON "ObjectStorageOperationPinnedObject"
FOR EACH ROW
EXECUTE FUNCTION "prevent_receipted_object_storage_history_mutation"();
