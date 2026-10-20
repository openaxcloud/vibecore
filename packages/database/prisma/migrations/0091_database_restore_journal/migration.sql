ALTER TABLE "DatabaseInstance"
  ADD COLUMN "activeTargetRef" TEXT,
  ADD COLUMN "bindingVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "DatabaseRestoreExecution" (
  "restoreId" TEXT NOT NULL,
  "activeLock" TEXT,
  "phase" TEXT NOT NULL DEFAULT 'PENDING',
  "resumePhase" TEXT,
  "runnerToken" TEXT,
  "expectedBindingVersion" INTEGER NOT NULL,
  "appliedBindingVersion" INTEGER,
  "sourceTargetRef" TEXT,
  "originalSecretEncrypted" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetConnectionEncrypted" TEXT,
  "snapshot" JSONB,
  "archive" JSONB,
  "target" JSONB,
  "quiescence" JSONB,
  "readback" JSONB,
  "release" JSONB,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DatabaseRestoreExecution_pkey" PRIMARY KEY ("restoreId"),
  CONSTRAINT "DatabaseRestoreExecution_restoreId_fkey" FOREIGN KEY ("restoreId")
    REFERENCES "DatabaseRestore"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DatabaseRestoreExecution_activeLock_key" ON "DatabaseRestoreExecution"("activeLock");
CREATE UNIQUE INDEX "DatabaseRestoreExecution_targetId_key" ON "DatabaseRestoreExecution"("targetId");
CREATE INDEX "DatabaseRestoreExecution_phase_createdAt_idx" ON "DatabaseRestoreExecution"("phase", "createdAt");
