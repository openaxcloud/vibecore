CREATE TYPE "ProjectVolumeErasureState" AS ENUM (
  'PREPARED',
  'INVENTORIED',
  'ERASING',
  'VERIFIED'
);

CREATE TABLE "ProjectVolumeErasure" (
  "operationId" TEXT NOT NULL,
  "projectIdSnapshot" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownershipEpoch" INTEGER NOT NULL,
  "namespace" TEXT NOT NULL,
  "state" "ProjectVolumeErasureState" NOT NULL DEFAULT 'PREPARED',
  "sourceSnapshot" JSONB NOT NULL,
  "inventory" JSONB,
  "inventoryHash" TEXT,
  "evidence" JSONB,
  "verificationHash" TEXT,
  "verificationFencingToken" BIGINT,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inventoriedAt" TIMESTAMP(3),
  "erasingAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectVolumeErasure_pkey" PRIMARY KEY ("operationId"),
  CONSTRAINT "ProjectVolumeErasure_identity_check" CHECK (
    char_length("projectIdSnapshot") BETWEEN 1 AND 200
    AND char_length("organizationId") BETWEEN 1 AND 200
    AND char_length("namespace") BETWEEN 1 AND 253
    AND "ownershipEpoch" >= 0
  ),
  CONSTRAINT "ProjectVolumeErasure_hash_check" CHECK (
    ("inventoryHash" IS NULL OR "inventoryHash" ~ '^[0-9a-f]{64}$')
    AND ("verificationHash" IS NULL OR "verificationHash" ~ '^[0-9a-f]{64}$')
    AND ("verificationFencingToken" IS NULL OR "verificationFencingToken" > 0)
  ),
  CONSTRAINT "ProjectVolumeErasure_state_payload_check" CHECK (
    ("state" = 'PREPARED'
      AND "inventory" IS NULL AND "inventoryHash" IS NULL
      AND "evidence" IS NULL AND "verificationHash" IS NULL
      AND "verificationFencingToken" IS NULL)
    OR
    ("state" IN ('INVENTORIED', 'ERASING')
      AND "inventory" IS NOT NULL AND "inventoryHash" IS NOT NULL
      AND "evidence" IS NULL AND "verificationHash" IS NULL
      AND "verificationFencingToken" IS NULL)
    OR
    ("state" = 'VERIFIED' AND "inventory" IS NOT NULL AND "inventoryHash" IS NOT NULL
      AND "evidence" IS NOT NULL AND "verificationHash" IS NOT NULL
      AND "verificationFencingToken" IS NOT NULL)
  )
);

CREATE TABLE "ProjectVolumeErasureTarget" (
  "operationId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "namespace" TEXT NOT NULL,
  "pvcName" TEXT NOT NULL,
  "expectedPvcUid" TEXT,
  "inventoryEntry" JSONB,
  "evidenceEntry" JSONB,
  "verifiedFencingToken" BIGINT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectVolumeErasureTarget_pkey" PRIMARY KEY ("operationId", "ordinal"),
  CONSTRAINT "ProjectVolumeErasureTarget_identity_check" CHECK (
    "ordinal" >= 0
    AND char_length("namespace") BETWEEN 1 AND 253
    AND char_length("pvcName") BETWEEN 1 AND 253
    AND ("expectedPvcUid" IS NULL OR char_length("expectedPvcUid") BETWEEN 1 AND 255)
    AND ("verifiedFencingToken" IS NULL OR "verifiedFencingToken" > 0)
    AND (("evidenceEntry" IS NULL AND "verifiedFencingToken" IS NULL AND "verifiedAt" IS NULL)
      OR ("evidenceEntry" IS NOT NULL AND "verifiedFencingToken" IS NOT NULL AND "verifiedAt" IS NOT NULL))
  )
);

ALTER TABLE "ProjectVolumeErasure"
  ADD CONSTRAINT "ProjectVolumeErasure_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "ObjectStorageOperation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectVolumeErasureTarget"
  ADD CONSTRAINT "ProjectVolumeErasureTarget_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "ProjectVolumeErasure"("operationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProjectVolumeErasure_projectIdSnapshot_state_createdAt_idx"
  ON "ProjectVolumeErasure"("projectIdSnapshot", "state", "createdAt");
CREATE INDEX "ProjectVolumeErasure_state_updatedAt_idx"
  ON "ProjectVolumeErasure"("state", "updatedAt");
CREATE UNIQUE INDEX "ProjectVolumeErasureTarget_identity_key"
  ON "ProjectVolumeErasureTarget"("operationId", "namespace", "pvcName");
CREATE INDEX "ProjectVolumeErasureTarget_resource_idx"
  ON "ProjectVolumeErasureTarget"("namespace", "pvcName");
CREATE INDEX "ProjectVolumeErasureTarget_progress_idx"
  ON "ProjectVolumeErasureTarget"("operationId", "verifiedFencingToken", "ordinal");

CREATE FUNCTION "vibecore_project_volume_target_lock"(target_namespace TEXT, target_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('project-volume-target:' || target_namespace || '/' || target_name, 0)
  );
END;
$$;

CREATE FUNCTION "vibecore_project_volume_erasure_target_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "vibecore_project_volume_target_lock"(NEW."namespace", NEW."pvcName");
    IF EXISTS (
      SELECT 1
      FROM "ProjectRuntimeEffectTarget" target
      JOIN "ProjectRuntimeEffect" effect ON effect."id" = target."effectId"
      WHERE target."kind" = 'PersistentVolumeClaim'
        AND target."namespace" = NEW."namespace"
        AND target."name" = NEW."pvcName"
        AND effect."state" IN ('PREPARED', 'IN_FLIGHT')
    ) THEN
      RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_RUNTIME_EFFECT_ACTIVE';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."operationId" <> OLD."operationId"
     OR NEW."ordinal" <> OLD."ordinal"
     OR NEW."namespace" <> OLD."namespace"
     OR NEW."pvcName" <> OLD."pvcName"
     OR NEW."expectedPvcUid" IS DISTINCT FROM OLD."expectedPvcUid"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_TARGET_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD."inventoryEntry" IS NOT NULL AND NEW."inventoryEntry" IS DISTINCT FROM OLD."inventoryEntry" THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_INVENTORY_IMMUTABLE';
  END IF;
  IF OLD."evidenceEntry" IS NOT NULL
     AND NEW."evidenceEntry" IS DISTINCT FROM OLD."evidenceEntry"
     AND (NEW."verifiedFencingToken" IS NULL OR NEW."verifiedFencingToken" <= OLD."verifiedFencingToken")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_EVIDENCE_FENCE_STALE';
  END IF;
  IF OLD."verifiedFencingToken" IS NOT NULL
     AND (NEW."verifiedFencingToken" IS NULL OR NEW."verifiedFencingToken" < OLD."verifiedFencingToken")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_EVIDENCE_FENCE_STALE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectVolumeErasureTarget_guard"
BEFORE INSERT OR UPDATE ON "ProjectVolumeErasureTarget"
FOR EACH ROW EXECUTE FUNCTION "vibecore_project_volume_erasure_target_guard"();

CREATE FUNCTION "vibecore_project_volume_erasure_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."operationId" <> OLD."operationId"
     OR NEW."projectIdSnapshot" <> OLD."projectIdSnapshot"
     OR NEW."organizationId" <> OLD."organizationId"
     OR NEW."ownershipEpoch" <> OLD."ownershipEpoch"
     OR NEW."namespace" <> OLD."namespace"
     OR NEW."sourceSnapshot" IS DISTINCT FROM OLD."sourceSnapshot"
     OR NEW."preparedAt" <> OLD."preparedAt"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD."inventory" IS NOT NULL
     AND (NEW."inventory" IS DISTINCT FROM OLD."inventory" OR NEW."inventoryHash" IS DISTINCT FROM OLD."inventoryHash")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_INVENTORY_IMMUTABLE';
  END IF;
  IF NEW."state" <> OLD."state" AND NOT (
    (OLD."state" = 'PREPARED' AND NEW."state" = 'INVENTORIED')
    OR (OLD."state" = 'INVENTORIED' AND NEW."state" = 'ERASING')
    OR (OLD."state" = 'ERASING' AND NEW."state" = 'VERIFIED')
  ) THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_TRANSITION_INVALID';
  END IF;
  IF OLD."evidence" IS NOT NULL
     AND NEW."evidence" IS DISTINCT FROM OLD."evidence"
     AND (NEW."verificationFencingToken" IS NULL
       OR NEW."verificationFencingToken" <= OLD."verificationFencingToken")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_EVIDENCE_FENCE_STALE';
  END IF;
  IF OLD."verificationFencingToken" IS NOT NULL
     AND (NEW."verificationFencingToken" IS NULL
       OR NEW."verificationFencingToken" < OLD."verificationFencingToken")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_EVIDENCE_FENCE_STALE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectVolumeErasure_guard"
BEFORE UPDATE ON "ProjectVolumeErasure"
FOR EACH ROW EXECUTE FUNCTION "vibecore_project_volume_erasure_guard"();

CREATE FUNCTION "vibecore_runtime_effect_volume_erasure_fence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."kind" <> 'PersistentVolumeClaim' THEN
    RETURN NEW;
  END IF;
  PERFORM "vibecore_project_volume_target_lock"(NEW."namespace", NEW."name");
  IF EXISTS (
    SELECT 1
    FROM "ProjectVolumeErasureTarget" target
    JOIN "ProjectVolumeErasure" erasure ON erasure."operationId" = target."operationId"
    JOIN "ObjectStorageOperation" operation ON operation."id" = erasure."operationId"
    WHERE target."namespace" = NEW."namespace"
      AND target."pvcName" = NEW."name"
      AND operation."status" NOT IN ('COMMITTED', 'FAILED_SAFE')
  ) THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_TARGET_FROZEN';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectRuntimeEffectTarget_volume_erasure_fence"
BEFORE INSERT ON "ProjectRuntimeEffectTarget"
FOR EACH ROW EXECUTE FUNCTION "vibecore_runtime_effect_volume_erasure_fence"();
