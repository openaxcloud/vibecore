-- CTR-RELEASE-PUBLISH: persistent ReleaseCatalog. Each successful server publish
-- appends ONE immutable entry pinning the built image by DIGEST + a monotonic
-- per-project version. Redeploy-from-history re-runs an entry's image via the
-- proven rollback-by-digest path, so a release outlives deletion of its source
-- revision/workspace (I-PUB-3). publishedByDeploymentId is a plain pointer (no FK)
-- on purpose: the catalog entry must outlive the deployment it was cut from.

CREATE TABLE IF NOT EXISTS "ReleaseCatalogEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "imageRef" TEXT NOT NULL,
    "imageDigest" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'server',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "publishedByDeploymentId" TEXT,
    "revisionSha256" TEXT,
    "runtime" TEXT,
    "appUrl" TEXT,
    "label" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotionId" TEXT,
    "bundleRef" TEXT,
    "sbomRef" TEXT,
    "provenanceRef" TEXT,
    "configRef" TEXT,
    "accessPolicyVersion" TEXT,
    "retentionExpiresAt" TIMESTAMP(3),
    "referenceCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ReleaseCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- Monotonic per project: (projectId, version) is unique.
CREATE UNIQUE INDEX IF NOT EXISTS "ReleaseCatalogEntry_projectId_version_key" ON "ReleaseCatalogEntry"("projectId", "version");
CREATE INDEX IF NOT EXISTS "ReleaseCatalogEntry_projectId_createdAt_idx" ON "ReleaseCatalogEntry"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReleaseCatalogEntry_imageDigest_idx" ON "ReleaseCatalogEntry"("imageDigest");

-- onDelete: Cascade — a release cannot outlive its project.
ALTER TABLE "ReleaseCatalogEntry"
    ADD CONSTRAINT "ReleaseCatalogEntry_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- onDelete: SetNull — a release survives its author's deletion.
ALTER TABLE "ReleaseCatalogEntry"
    ADD CONSTRAINT "ReleaseCatalogEntry_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
