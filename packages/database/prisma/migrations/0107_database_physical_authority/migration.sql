CREATE TYPE "DatabasePhysicalTier" AS ENUM ('SHARED', 'ISOLATED');

ALTER TABLE "DatabaseInstance"
  ADD COLUMN "physicalTier" "DatabasePhysicalTier",
  ADD COLUMN "physicalClusterName" TEXT,
  ADD COLUMN "physicalDatabaseCrName" TEXT,
  ADD COLUMN "physicalDatabaseName" TEXT,
  ADD COLUMN "physicalRoleName" TEXT,
  ADD COLUMN "physicalBackupBucket" TEXT,
  ADD COLUMN "physicalBackupPrefix" TEXT,
  ADD COLUMN "physicalClusterUid" TEXT,
  ADD COLUMN "physicalDatabaseCrUid" TEXT,
  ADD COLUMN "physicalRetentionDays" INTEGER,
  ADD COLUMN "physicalAuthorityAt" TIMESTAMP(3),
  ADD CONSTRAINT "DatabaseInstance_physical_authority_check" CHECK (
    (
      "physicalTier" IS NULL
      AND "physicalClusterName" IS NULL
      AND "physicalDatabaseCrName" IS NULL
      AND "physicalDatabaseName" IS NULL
      AND "physicalRoleName" IS NULL
      AND "physicalBackupBucket" IS NULL
      AND "physicalBackupPrefix" IS NULL
      AND "physicalClusterUid" IS NULL
      AND "physicalDatabaseCrUid" IS NULL
      AND "physicalRetentionDays" IS NULL
      AND "physicalAuthorityAt" IS NULL
    )
    OR
    (
      "physicalTier" IS NOT NULL
      AND "physicalClusterName" IS NOT NULL
      AND char_length("physicalClusterName") BETWEEN 1 AND 253
      AND "physicalClusterName" ~ '^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$'
      AND "physicalAuthorityAt" IS NOT NULL
      AND "physicalRetentionDays" IS NOT NULL
      AND "physicalRetentionDays" BETWEEN 0 AND 3650
      AND (
        ("physicalBackupBucket" IS NULL AND "physicalBackupPrefix" IS NULL)
        OR (
          "physicalBackupBucket" IS NOT NULL
          AND char_length("physicalBackupBucket") BETWEEN 1 AND 222
          AND "physicalBackupBucket" ~ '^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$'
          AND "physicalBackupPrefix" IS NOT NULL
          AND char_length("physicalBackupPrefix") BETWEEN 1 AND 1024
          AND "physicalBackupPrefix" !~ '^/'
          AND "physicalBackupPrefix" ~ '/$'
          AND "physicalBackupPrefix" !~ '(^|/)\.\.(/|$)'
        )
      )
      AND (
        (
          "physicalTier" = 'ISOLATED'::"DatabasePhysicalTier"
          AND "physicalDatabaseCrName" IS NULL
          AND "physicalDatabaseName" IS NULL
          AND "physicalRoleName" IS NULL
          AND "physicalBackupBucket" IS NOT NULL
          AND "physicalBackupPrefix" IS NOT NULL
        )
        OR
        (
          "physicalTier" = 'SHARED'::"DatabasePhysicalTier"
          AND "physicalDatabaseCrName" IS NOT NULL
          AND char_length("physicalDatabaseCrName") BETWEEN 1 AND 253
          AND "physicalDatabaseCrName" ~ '^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$'
          AND "physicalDatabaseName" IS NOT NULL
          AND char_length("physicalDatabaseName") BETWEEN 1 AND 63
          AND "physicalDatabaseName" ~ '^[a-z_][a-z0-9_]{0,62}$'
          AND "physicalRoleName" IS NOT NULL
          AND char_length("physicalRoleName") BETWEEN 1 AND 63
          AND "physicalRoleName" ~ '^[a-z_][a-z0-9_]{0,62}$'
        )
      )
    )
  );

CREATE INDEX "DatabaseInstance_physicalTier_physicalClusterName_idx"
  ON "DatabaseInstance"("physicalTier", "physicalClusterName");

CREATE FUNCTION "vibecore_database_physical_authority_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."physicalAuthorityAt" IS NOT NULL AND (
    NEW."physicalTier" IS DISTINCT FROM OLD."physicalTier"
    OR NEW."physicalClusterName" IS DISTINCT FROM OLD."physicalClusterName"
    OR NEW."physicalDatabaseCrName" IS DISTINCT FROM OLD."physicalDatabaseCrName"
    OR NEW."physicalDatabaseName" IS DISTINCT FROM OLD."physicalDatabaseName"
    OR NEW."physicalRoleName" IS DISTINCT FROM OLD."physicalRoleName"
    OR NEW."physicalBackupBucket" IS DISTINCT FROM OLD."physicalBackupBucket"
    OR NEW."physicalBackupPrefix" IS DISTINCT FROM OLD."physicalBackupPrefix"
    OR NEW."physicalClusterUid" IS DISTINCT FROM OLD."physicalClusterUid"
    OR NEW."physicalDatabaseCrUid" IS DISTINCT FROM OLD."physicalDatabaseCrUid"
    OR NEW."physicalRetentionDays" IS DISTINCT FROM OLD."physicalRetentionDays"
    OR NEW."physicalAuthorityAt" IS DISTINCT FROM OLD."physicalAuthorityAt"
  ) THEN
    RAISE EXCEPTION 'DATABASE_PHYSICAL_AUTHORITY_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "DatabaseInstance_physical_authority_guard"
BEFORE UPDATE ON "DatabaseInstance"
FOR EACH ROW EXECUTE FUNCTION "vibecore_database_physical_authority_guard"();

/* 0106 receipts remain readable for already-committed forensic rows. New
 * finalization uses schema v2: multiple exact backup targets plus explicit
 * shared-cluster retention barriers and soft-deleted-generation absence. */
ALTER TABLE "ProjectDatabaseErasurePlan"
  DROP CONSTRAINT "ProjectDatabaseErasurePlan_verified_check";

ALTER TABLE "ProjectDatabaseErasurePlan"
  ADD CONSTRAINT "ProjectDatabaseErasurePlan_verified_check" CHECK (
    (
      "stage" = 'VERIFIED'
      AND "receipt" IS NOT NULL
      AND "verifiedAt" IS NOT NULL
      AND jsonb_typeof("receipt") = 'object'
      AND ("receipt" -> 'schemaVersion') IN ('1'::jsonb, '2'::jsonb)
      AND "receipt" ->> 'operationId' = "operationId"
      AND "receipt" ->> 'projectId' = "projectId"
      AND "receipt" ->> 'organizationId' = "organizationId"
      AND "receipt" ->> 'inventorySha256' = "inventorySha256"
      AND jsonb_typeof("receipt" -> 'effects') = 'object'
      AND ("receipt" #>> '{effects,kubernetesResourcesDeleted}')::numeric BETWEEN 0 AND 9007199254740991
      AND ("receipt" #>> '{effects,sharedTenantsErased}')::numeric BETWEEN 0 AND 9007199254740991
      AND ("receipt" #>> '{effects,backupGenerationsDeleted}')::numeric BETWEEN 0 AND 9007199254740991
      AND jsonb_typeof("receipt" -> 'proof') = 'object'
      AND "receipt" -> 'proof' ->> 'kubernetesNamespace' = 'project-databases'
      AND "receipt" -> 'proof' -> 'kubernetesAbsent' = 'true'::jsonb
      AND "receipt" -> 'proof' -> 'sharedTenantsAbsent' = 'true'::jsonb
      AND "receipt" -> 'proof' -> 'backupGenerationsAbsent' = 'true'::jsonb
      AND (
        "receipt" -> 'schemaVersion' = '1'::jsonb
        OR (
          "receipt" -> 'schemaVersion' = '2'::jsonb
          AND "plan" -> 'schemaVersion' = '2'::jsonb
          AND jsonb_typeof("plan" -> 'backupTargets') = 'array'
          AND jsonb_typeof("plan" -> 'sharedRetentionBarriers') = 'array'
          AND jsonb_typeof("receipt" #> '{proof,backupTargets}') = 'array'
          AND jsonb_typeof("receipt" #> '{proof,sharedRetentionBarriers}') = 'array'
        )
      )
    )
    OR ("stage" <> 'VERIFIED' AND "receipt" IS NULL AND "verifiedAt" IS NULL)
  );

/*
 * Defense in depth for every deletion surface, including account purge and
 * organization cascades. A project that ever acquired a managed database may
 * only disappear inside the exact PROJECT_PERMANENT_DELETE finalizer whose
 * immutable CNPG plan is already VERIFIED for the current ownership epoch.
 */
CREATE FUNCTION "vibecore_project_database_delete_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "DatabaseInstance" instance WHERE instance."projectId" = OLD.id
  ) AND NOT EXISTS (
    SELECT 1
    FROM "ProjectDatabaseErasurePlan" plan
    JOIN "ObjectStorageOperation" operation ON operation.id = plan."operationId"
    JOIN "ObjectStorageOperationProjectScope" scope ON scope."operationId" = operation.id
    WHERE plan."projectId" = OLD.id
      AND plan."organizationId" = OLD."organizationId"
      AND plan."ownershipEpoch" = OLD."ownershipEpoch"
      AND plan.stage = 'VERIFIED'::"ProjectDatabaseErasureStage"
      AND plan.receipt IS NOT NULL
      AND plan.receipt -> 'schemaVersion' = '2'::jsonb
      AND plan.receipt ->> 'operationId' = operation.id
      AND plan.receipt ->> 'projectId' = OLD.id
      AND plan.receipt ->> 'organizationId' = OLD."organizationId"
      AND plan.receipt ->> 'inventorySha256' = plan."inventorySha256"
      AND operation.kind = 'PROJECT_PERMANENT_DELETE'::"ObjectStorageOperationKind"
      AND operation.status = 'VERIFYING'::"ObjectStorageOperationStatus"
      AND scope."projectIdSnapshot" = OLD.id
      AND scope."expectedOrganizationId" = OLD."organizationId"
  ) THEN
    RAISE EXCEPTION 'PROJECT_DATABASE_ERASURE_RECEIPT_REQUIRED';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "Project_database_delete_guard"
BEFORE DELETE ON "Project"
FOR EACH ROW EXECUTE FUNCTION "vibecore_project_database_delete_guard"();

/* A caller cannot bypass the Project guard by deleting DatabaseInstance rows
 * first. During an FK cascade the parent row may already be invisible to the
 * child trigger, so the active VERIFYING operation remains the authoritative
 * scope; when the Project is still visible its ownership epoch must also match. */
CREATE FUNCTION "vibecore_database_instance_delete_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ProjectDatabaseErasurePlan" plan
    JOIN "ObjectStorageOperation" operation ON operation.id = plan."operationId"
    JOIN "ObjectStorageOperationProjectScope" scope ON scope."operationId" = operation.id
    WHERE plan."projectId" = OLD."projectId"
      AND plan."organizationId" = OLD."organizationId"
      AND plan.stage = 'VERIFIED'::"ProjectDatabaseErasureStage"
      AND plan.receipt IS NOT NULL
      AND plan.receipt -> 'schemaVersion' = '2'::jsonb
      AND plan.receipt ->> 'operationId' = operation.id
      AND plan.receipt ->> 'projectId' = OLD."projectId"
      AND plan.receipt ->> 'organizationId' = OLD."organizationId"
      AND plan.receipt ->> 'inventorySha256' = plan."inventorySha256"
      AND operation.kind = 'PROJECT_PERMANENT_DELETE'::"ObjectStorageOperationKind"
      AND operation.status = 'VERIFYING'::"ObjectStorageOperationStatus"
      AND scope."projectIdSnapshot" = OLD."projectId"
      AND scope."expectedOrganizationId" = OLD."organizationId"
      AND NOT EXISTS (
        SELECT 1
        FROM "Project" project
        WHERE project.id = OLD."projectId"
          AND (
            project."organizationId" <> OLD."organizationId"
            OR project."ownershipEpoch" <> plan."ownershipEpoch"
          )
      )
  ) THEN
    RAISE EXCEPTION 'DATABASE_INSTANCE_ERASURE_RECEIPT_REQUIRED';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "DatabaseInstance_delete_guard"
BEFORE DELETE ON "DatabaseInstance"
FOR EACH ROW EXECUTE FUNCTION "vibecore_database_instance_delete_guard"();
