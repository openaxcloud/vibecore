CREATE TYPE "ProjectDatabaseErasureStage" AS ENUM (
  'INVENTORY_BOUND',
  'KUBERNETES_PURGE',
  'SHARED_SQL_PURGE',
  'BACKUP_PREFIX_PURGE',
  'FINAL_VERIFICATION',
  'VERIFIED'
);

CREATE TABLE "ProjectDatabaseErasurePlan" (
  "operationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownershipEpoch" INTEGER NOT NULL,
  "inventorySha256" TEXT NOT NULL,
  "plan" JSONB NOT NULL,
  "stage" "ProjectDatabaseErasureStage" NOT NULL DEFAULT 'INVENTORY_BOUND',
  "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "receipt" JSONB,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectDatabaseErasurePlan_pkey" PRIMARY KEY ("operationId"),
  CONSTRAINT "ProjectDatabaseErasurePlan_identity_check" CHECK (
    char_length("projectId") BETWEEN 1 AND 200
    AND char_length("organizationId") BETWEEN 1 AND 200
    AND "ownershipEpoch" >= 0
    AND "inventorySha256" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("plan") = 'object'
    AND jsonb_typeof("evidence") = 'object'
  ),
  CONSTRAINT "ProjectDatabaseErasurePlan_verified_check" CHECK (
    (
      "stage" = 'VERIFIED'
      AND "receipt" IS NOT NULL
      AND "verifiedAt" IS NOT NULL
      AND (
        jsonb_typeof("receipt") = 'object'
        AND ("receipt" - ARRAY[
          'schemaVersion', 'operationId', 'projectId', 'organizationId',
          'inventorySha256', 'verifiedAt', 'effects', 'proof'
        ]::text[]) = '{}'::jsonb
        AND "receipt" -> 'schemaVersion' = '1'::jsonb
        AND "receipt" ->> 'operationId' = "operationId"
        AND "receipt" ->> 'projectId' = "projectId"
        AND "receipt" ->> 'organizationId' = "organizationId"
        AND "receipt" ->> 'inventorySha256' = "inventorySha256"
        AND jsonb_typeof("receipt" -> 'effects') = 'object'
        AND (("receipt" -> 'effects') - ARRAY[
          'kubernetesResourcesDeleted', 'sharedTenantsErased', 'backupGenerationsDeleted'
        ]::text[]) = '{}'::jsonb
        AND jsonb_typeof("receipt" -> 'effects' -> 'kubernetesResourcesDeleted') = 'number'
        AND jsonb_typeof("receipt" -> 'effects' -> 'sharedTenantsErased') = 'number'
        AND jsonb_typeof("receipt" -> 'effects' -> 'backupGenerationsDeleted') = 'number'
        AND ("receipt" #>> '{effects,kubernetesResourcesDeleted}')::numeric BETWEEN 0 AND 9007199254740991
        AND ("receipt" #>> '{effects,sharedTenantsErased}')::numeric BETWEEN 0 AND 9007199254740991
        AND ("receipt" #>> '{effects,backupGenerationsDeleted}')::numeric BETWEEN 0 AND 9007199254740991
        AND trunc(("receipt" #>> '{effects,kubernetesResourcesDeleted}')::numeric)
          = ("receipt" #>> '{effects,kubernetesResourcesDeleted}')::numeric
        AND trunc(("receipt" #>> '{effects,sharedTenantsErased}')::numeric)
          = ("receipt" #>> '{effects,sharedTenantsErased}')::numeric
        AND trunc(("receipt" #>> '{effects,backupGenerationsDeleted}')::numeric)
          = ("receipt" #>> '{effects,backupGenerationsDeleted}')::numeric
        AND ("receipt" #>> '{effects,kubernetesResourcesDeleted}')::numeric
          = COALESCE(("evidence" #>> '{KUBERNETES_PURGE,deleted}')::numeric, 0)
        AND ("receipt" #>> '{effects,sharedTenantsErased}')::numeric
          = COALESCE(("evidence" #>> '{SHARED_SQL_PURGE,erased}')::numeric, 0)
        AND ("receipt" #>> '{effects,backupGenerationsDeleted}')::numeric
          = COALESCE(("evidence" #>> '{BACKUP_PREFIX_PURGE,deletedGenerations}')::numeric, 0)
        AND jsonb_typeof("receipt" -> 'proof') = 'object'
        AND (("receipt" -> 'proof') - ARRAY[
          'kubernetesNamespace', 'kubernetesAbsent', 'sharedTenantsAbsent',
          'backupBucket', 'backupPrefix', 'backupGenerationsAbsent'
        ]::text[]) = '{}'::jsonb
        AND "receipt" -> 'proof' ->> 'kubernetesNamespace' = 'project-databases'
        AND "receipt" -> 'proof' -> 'kubernetesAbsent' = 'true'::jsonb
        AND "receipt" -> 'proof' -> 'sharedTenantsAbsent' = 'true'::jsonb
        AND "receipt" -> 'proof' ->> 'backupBucket' = "plan" ->> 'backupBucket'
        AND "receipt" -> 'proof' ->> 'backupPrefix' = "plan" ->> 'backupPrefix'
        AND "receipt" -> 'proof' -> 'backupGenerationsAbsent' = 'true'::jsonb
      ) IS TRUE
    )
    OR ("stage" <> 'VERIFIED' AND "receipt" IS NULL AND "verifiedAt" IS NULL)
  )
);

ALTER TABLE "ProjectDatabaseErasurePlan"
  ADD CONSTRAINT "ProjectDatabaseErasurePlan_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "ObjectStorageOperation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProjectDatabaseErasurePlan_projectId_createdAt_idx"
  ON "ProjectDatabaseErasurePlan"("projectId", "createdAt");
CREATE INDEX "ProjectDatabaseErasurePlan_organizationId_createdAt_idx"
  ON "ProjectDatabaseErasurePlan"("organizationId", "createdAt");
CREATE INDEX "ProjectDatabaseErasurePlan_stage_updatedAt_idx"
  ON "ProjectDatabaseErasurePlan"("stage", "updatedAt");

CREATE FUNCTION "vibecore_project_database_erasure_plan_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_rank integer;
  new_rank integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROJECT_DATABASE_ERASURE_PLAN_APPEND_ONLY';
  END IF;

  IF NEW."operationId" <> OLD."operationId"
     OR NEW."projectId" <> OLD."projectId"
     OR NEW."organizationId" <> OLD."organizationId"
     OR NEW."ownershipEpoch" <> OLD."ownershipEpoch"
     OR NEW."inventorySha256" <> OLD."inventorySha256"
     OR NEW."plan" <> OLD."plan"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION 'PROJECT_DATABASE_ERASURE_PLAN_IMMUTABLE';
  END IF;

  IF NOT (NEW."evidence" @> OLD."evidence") THEN
    RAISE EXCEPTION 'PROJECT_DATABASE_ERASURE_EVIDENCE_APPEND_ONLY';
  END IF;

  IF OLD."receipt" IS NOT NULL AND NEW."receipt" IS DISTINCT FROM OLD."receipt" THEN
    RAISE EXCEPTION 'PROJECT_DATABASE_ERASURE_RECEIPT_IMMUTABLE';
  END IF;

  old_rank := array_position(
    ARRAY['INVENTORY_BOUND', 'KUBERNETES_PURGE', 'SHARED_SQL_PURGE', 'BACKUP_PREFIX_PURGE', 'FINAL_VERIFICATION', 'VERIFIED'],
    OLD."stage"::text
  );
  new_rank := array_position(
    ARRAY['INVENTORY_BOUND', 'KUBERNETES_PURGE', 'SHARED_SQL_PURGE', 'BACKUP_PREFIX_PURGE', 'FINAL_VERIFICATION', 'VERIFIED'],
    NEW."stage"::text
  );

  IF NEW."stage" <> OLD."stage"
     AND NOT (
       new_rank = old_rank + 1
       OR (NEW."stage" = 'FINAL_VERIFICATION' AND OLD."stage" <> 'VERIFIED')
     )
  THEN
    RAISE EXCEPTION 'PROJECT_DATABASE_ERASURE_TRANSITION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectDatabaseErasurePlan_guard"
BEFORE UPDATE OR DELETE ON "ProjectDatabaseErasurePlan"
FOR EACH ROW EXECUTE FUNCTION "vibecore_project_database_erasure_plan_guard"();
