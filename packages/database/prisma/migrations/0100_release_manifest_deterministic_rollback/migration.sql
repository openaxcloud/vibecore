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
