ALTER TABLE "ProjectVolumeErasure"
  ADD COLUMN "quiescenceSnapshot" JSONB,
  ADD COLUMN "quiescenceHash" TEXT,
  ADD COLUMN "finalScanEvidence" JSONB,
  ADD COLUMN "finalScanHash" TEXT,
  ADD COLUMN "finalScanFencingToken" BIGINT,
  ADD COLUMN "finalScannedAt" TIMESTAMP(3),
  ADD CONSTRAINT "ProjectVolumeErasure_quiescence_final_scan_check" CHECK (
    (("quiescenceSnapshot" IS NULL AND "quiescenceHash" IS NULL)
      OR ("quiescenceSnapshot" IS NOT NULL AND "quiescenceHash" ~ '^[0-9a-f]{64}$'))
    AND
    (("finalScanEvidence" IS NULL AND "finalScanHash" IS NULL
        AND "finalScanFencingToken" IS NULL AND "finalScannedAt" IS NULL)
      OR ("finalScanEvidence" IS NOT NULL AND "finalScanHash" ~ '^[0-9a-f]{64}$'
        AND "finalScanFencingToken" > 0 AND "finalScannedAt" IS NOT NULL))
  );

CREATE TABLE "ProjectRuntimeEffectVolumeEvidence" (
  "effectId" TEXT NOT NULL,
  "targetOrdinal" INTEGER NOT NULL,
  "pvcUid" TEXT NOT NULL,
  "pvcResourceVersion" TEXT NOT NULL,
  "pvName" TEXT NOT NULL,
  "pvUid" TEXT NOT NULL,
  "pvResourceVersion" TEXT NOT NULL,
  "csiDriver" TEXT NOT NULL,
  "csiVolumeHandle" TEXT NOT NULL,
  "providerResourceId" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectRuntimeEffectVolumeEvidence_pkey" PRIMARY KEY ("effectId", "targetOrdinal"),
  CONSTRAINT "ProjectRuntimeEffectVolumeEvidence_identity_check" CHECK (
    "targetOrdinal" >= 0
    AND char_length("pvcUid") BETWEEN 1 AND 255
    AND char_length("pvcResourceVersion") BETWEEN 1 AND 255
    AND char_length("pvName") BETWEEN 1 AND 253
    AND char_length("pvUid") BETWEEN 1 AND 255
    AND char_length("pvResourceVersion") BETWEEN 1 AND 255
    AND char_length("csiDriver") BETWEEN 1 AND 192
    AND char_length("csiVolumeHandle") BETWEEN 1 AND 1024
    AND char_length("providerResourceId") BETWEEN 1 AND 255
    AND "evidenceHash" ~ '^[0-9a-f]{64}$'
  )
);

ALTER TABLE "ProjectRuntimeEffectVolumeEvidence"
  ADD CONSTRAINT "ProjectRuntimeEffectVolumeEvidence_target_fkey"
  FOREIGN KEY ("effectId", "targetOrdinal")
  REFERENCES "ProjectRuntimeEffectTarget"("effectId", "ordinal")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProjectRuntimeEffectVolumeEvidence_handle_idx"
  ON "ProjectRuntimeEffectVolumeEvidence"("csiDriver", "csiVolumeHandle");
CREATE INDEX "ProjectRuntimeEffectVolumeEvidence_pvcUid_idx"
  ON "ProjectRuntimeEffectVolumeEvidence"("pvcUid");

CREATE FUNCTION "vibecore_project_runtime_effect_volume_evidence_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_kind TEXT;
  effect_state "ProjectRuntimeEffectState";
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PROJECT_RUNTIME_EFFECT_VOLUME_EVIDENCE_IMMUTABLE';
  END IF;

  SELECT target."kind", effect."state"
  INTO target_kind, effect_state
  FROM "ProjectRuntimeEffectTarget" target
  JOIN "ProjectRuntimeEffect" effect ON effect."id" = target."effectId"
  WHERE target."effectId" = NEW."effectId" AND target."ordinal" = NEW."targetOrdinal"
  FOR SHARE OF target, effect;

  IF target_kind IS DISTINCT FROM 'PersistentVolumeClaim'
     OR effect_state IS DISTINCT FROM 'IN_FLIGHT'::"ProjectRuntimeEffectState"
  THEN
    RAISE EXCEPTION 'PROJECT_RUNTIME_EFFECT_VOLUME_EVIDENCE_AUTHORITY_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProjectRuntimeEffectVolumeEvidence_guard"
BEFORE INSERT OR UPDATE ON "ProjectRuntimeEffectVolumeEvidence"
FOR EACH ROW EXECUTE FUNCTION "vibecore_project_runtime_effect_volume_evidence_guard"();

CREATE OR REPLACE FUNCTION "vibecore_project_runtime_effect_transition_guard"()
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

  IF OLD."state" = 'IN_FLIGHT' AND NEW."state" = 'SETTLED' THEN
    IF NEW."providerReceipt"->>'outcome' IS DISTINCT FROM 'VERIFIED_BOUND_CSI'
       AND EXISTS (
         SELECT 1 FROM "ProjectRuntimeEffectTarget" target
         WHERE target."effectId" = OLD."id" AND target."kind" = 'PersistentVolumeClaim'
       )
    THEN
      RAISE EXCEPTION 'PROJECT_RUNTIME_EFFECT_CSI_RECEIPT_REQUIRED';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "ProjectRuntimeEffectTarget" target
      LEFT JOIN "ProjectRuntimeEffectVolumeEvidence" evidence
        ON evidence."effectId" = target."effectId" AND evidence."targetOrdinal" = target."ordinal"
      WHERE target."effectId" = OLD."id"
        AND target."kind" = 'PersistentVolumeClaim'
        AND evidence."effectId" IS NULL
    ) THEN
      RAISE EXCEPTION 'PROJECT_RUNTIME_EFFECT_CSI_EVIDENCE_INCOMPLETE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "vibecore_project_volume_erasure_guard"()
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
  IF OLD."quiescenceSnapshot" IS NOT NULL
     AND (NEW."quiescenceSnapshot" IS DISTINCT FROM OLD."quiescenceSnapshot"
       OR NEW."quiescenceHash" IS DISTINCT FROM OLD."quiescenceHash")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_QUIESCENCE_IMMUTABLE';
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
  IF OLD."finalScanEvidence" IS NOT NULL
     AND NEW."finalScanEvidence" IS DISTINCT FROM OLD."finalScanEvidence"
     AND (NEW."finalScanFencingToken" IS NULL
       OR NEW."finalScanFencingToken" <= OLD."finalScanFencingToken")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_FINAL_SCAN_FENCE_STALE';
  END IF;
  IF OLD."finalScanFencingToken" IS NOT NULL
     AND (NEW."finalScanFencingToken" IS NULL
       OR NEW."finalScanFencingToken" < OLD."finalScanFencingToken")
  THEN
    RAISE EXCEPTION 'PROJECT_VOLUME_ERASURE_FINAL_SCAN_FENCE_STALE';
  END IF;
  RETURN NEW;
END;
$$;
