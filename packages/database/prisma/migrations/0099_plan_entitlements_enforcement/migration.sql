-- P1-COV-05: release manifests outlive prunable Deployment rows, so the exact
-- plan/badge/region pin must live on the immutable release itself. Existing
-- manifests remain NULL and are intentionally fail-closed by application code.
ALTER TABLE "ReleaseManifest"
ADD COLUMN "planEntitlements" JSONB,
ADD COLUMN "projectManifestDigest" TEXT;
