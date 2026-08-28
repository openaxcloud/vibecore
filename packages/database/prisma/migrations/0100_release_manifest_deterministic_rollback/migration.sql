-- P0 deterministic rollback after Deployment/AdminAuditLog pruning.
-- Nullable is intentional for rolling compatibility; readers reject legacy
-- server-image manifests explicitly instead of substituting mutable defaults.
ALTER TABLE "ReleaseManifest"
  ADD COLUMN "runtimeSpec" JSONB,
  ADD COLUMN "promotionEvidence" JSONB;

-- Release manifests deliberately have no Deployment FK because Deployment rows
-- are prunable. They must, however, share the owning Project's erasure lifetime:
-- remove only already-orphaned legacy rows, then make that invariant durable.
DELETE FROM "ReleaseManifest" AS manifest
WHERE NOT EXISTS (
  SELECT 1 FROM "Project" AS project WHERE project."id" = manifest."projectId"
);

ALTER TABLE "ReleaseManifest"
  ADD CONSTRAINT "ReleaseManifest_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- A release is append-only while its project exists. The parent FK cascade is
-- the sole deletion path, preserving account/project erasure without allowing a
-- deployment prune or an alternate Prisma/raw writer to rewrite history.
CREATE FUNCTION "releaseManifestRejectMutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR EXISTS (
    SELECT 1 FROM "Project" WHERE "id" = OLD."projectId"
  ) THEN
    RAISE EXCEPTION 'ReleaseManifest is append-only';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "ReleaseManifest_append_only"
BEFORE UPDATE OR DELETE ON "ReleaseManifest"
FOR EACH ROW
EXECUTE FUNCTION "releaseManifestRejectMutation"();

-- Server runtime manifests pin the exact historical RateCard version and
-- machine tuple. Keep those rows available and byte-stable forever: normal
-- publication may activate/deactivate a card, but it must never rewrite or
-- delete the historical pricing/runtime authority used by rollback.
CREATE FUNCTION "rateCardProtectHistoricalPins"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RateCard history is immutable';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."data" IS DISTINCT FROM OLD."data"
    OR NEW."effectiveAt" IS DISTINCT FROM OLD."effectiveAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'RateCard history is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "RateCard_historical_pins_immutable"
BEFORE UPDATE OR DELETE ON "RateCard"
FOR EACH ROW
EXECUTE FUNCTION "rateCardProtectHistoricalPins"();

-- A completed rollback row is the durable HTTP receipt and the authority that
-- prevents the same idempotency key from starting a second effect. Preserve it
-- until Project erasure. User erasure may only apply the declared FK SET NULL
-- to actorUserId; every response/fence/source field remains immutable.
CREATE FUNCTION "rollbackIdempotencyProtectCompleted"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
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
    AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = OLD."actorUserId")
    AND (to_jsonb(NEW) - 'actorUserId') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'actorUserId')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Completed RollbackIdempotencyRequest is immutable';
END;
$$;

CREATE TRIGGER "RollbackIdempotencyRequest_completed_immutable"
BEFORE UPDATE OR DELETE ON "RollbackIdempotencyRequest"
FOR EACH ROW
EXECUTE FUNCTION "rollbackIdempotencyProtectCompleted"();

-- A remix target stays soft-hidden while external file/storage/database work
-- runs. Carry its verified IDE/file manifest on the fenced job so finalize can
-- publish ProjectIdeState, reveal the Project, and mark COMPLETED atomically.
ALTER TABLE "RemixJob"
  ADD COLUMN "targetIdeState" JSONB,
  ADD COLUMN "targetIdeStateDigest" TEXT,
  ADD CONSTRAINT "RemixJob_targetIdeState_pin_pair" CHECK (
    ("targetIdeState" IS NULL AND "targetIdeStateDigest" IS NULL)
    OR (
      jsonb_typeof("targetIdeState") = 'object'
      AND "targetIdeStateDigest" ~ '^sha256:[a-f0-9]{64}$'
    )
  );
