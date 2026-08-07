-- P0-V3-08: immutable per-publish deployment rollback manifest.

CREATE TABLE "ReleaseManifest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'preview',
    "version" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "artifactKind" TEXT NOT NULL,
    "artifactRef" TEXT NOT NULL,
    "artifactDigest" TEXT NOT NULL,
    "storeGeneration" TEXT,
    "configDigest" TEXT,
    "dbMigrationPoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReleaseManifest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReleaseManifest_projectId_environment_version_key" ON "ReleaseManifest"("projectId", "environment", "version");
CREATE INDEX "ReleaseManifest_projectId_environment_idx" ON "ReleaseManifest"("projectId", "environment");
CREATE INDEX "ReleaseManifest_deploymentId_idx" ON "ReleaseManifest"("deploymentId");
