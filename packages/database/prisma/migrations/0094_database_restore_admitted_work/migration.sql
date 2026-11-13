-- Durable admitted work survives worker failure. No TTL or cascade may erase debt.
CREATE TABLE "DatabaseRestoreAdmittedWork" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "bindingVersion" INTEGER NOT NULL,
  "targetRef" TEXT,
  "ownerIncarnation" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "DatabaseRestoreAdmittedWork_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DatabaseRestoreAdmittedWork_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "DatabaseInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DatabaseRestoreAdmittedWork_instanceId_settledAt_idx"
  ON "DatabaseRestoreAdmittedWork"("instanceId", "settledAt");
