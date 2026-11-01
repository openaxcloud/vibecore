CREATE TABLE "DatabaseBackupProvenance" (
  "id" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "bindingVersion" INTEGER NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceUid" TEXT NOT NULL,
  "backupName" TEXT NOT NULL,
  "backupUid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DatabaseBackupProvenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DatabaseBackupProvenance_instanceId_fkey" FOREIGN KEY ("instanceId")
    REFERENCES "DatabaseInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DatabaseBackupProvenance_nonce_key" ON "DatabaseBackupProvenance"("nonce");
CREATE UNIQUE INDEX "DatabaseBackupProvenance_projectId_environment_snapshotId_key"
  ON "DatabaseBackupProvenance"("projectId", "environment", "snapshotId");
CREATE INDEX "DatabaseBackupProvenance_instanceId_idx" ON "DatabaseBackupProvenance"("instanceId");
