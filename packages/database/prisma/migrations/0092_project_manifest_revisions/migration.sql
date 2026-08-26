-- P0-EX-08 — durable, append-only ProjectManifest revisions.
-- The API canonicalizes and hashes every manifest; DB checks keep obviously
-- malformed metadata from being inserted by an alternate writer.
CREATE TABLE "ProjectManifestRevision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "manifestVersion" INTEGER NOT NULL,
  "digest" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectManifestRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectManifestRevision_schemaVersion_check" CHECK ("schemaVersion" > 0),
  CONSTRAINT "ProjectManifestRevision_manifestVersion_check" CHECK ("manifestVersion" > 0),
  CONSTRAINT "ProjectManifestRevision_digest_check" CHECK ("digest" ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT "ProjectManifestRevision_manifest_object_check" CHECK (jsonb_typeof("manifest") = 'object'),
  CONSTRAINT "ProjectManifestRevision_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectManifestRevision_projectId_manifestVersion_key"
  ON "ProjectManifestRevision"("projectId", "manifestVersion");

CREATE UNIQUE INDEX "ProjectManifestRevision_projectId_digest_key"
  ON "ProjectManifestRevision"("projectId", "digest");

CREATE INDEX "ProjectManifestRevision_projectId_createdAt_idx"
  ON "ProjectManifestRevision"("projectId", "createdAt");

-- Revision rows are insert-only while their project exists. A project hard
-- delete is the sole deletion path and must still cascade cleanly.
CREATE FUNCTION "projectManifestRevisionRejectMutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR EXISTS (
    SELECT 1 FROM "Project" WHERE "id" = OLD."projectId"
  ) THEN
    RAISE EXCEPTION 'ProjectManifestRevision is append-only';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "ProjectManifestRevision_append_only"
BEFORE UPDATE OR DELETE ON "ProjectManifestRevision"
FOR EACH ROW
EXECUTE FUNCTION "projectManifestRevisionRejectMutation"();
