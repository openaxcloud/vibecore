CREATE TABLE "DatabaseRestoreConsumer" (
  "id" TEXT PRIMARY KEY,
  "instanceId" TEXT NOT NULL REFERENCES "DatabaseInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "bindingVersion" INTEGER NOT NULL CHECK ("bindingVersion" >= 0),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('api', 'workload')),
  "uid" TEXT NOT NULL,
  "generation" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("state" IN ('ACTIVE', 'DRAIN_REQUESTED', 'DRAINED')),
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "drainRestoreId" TEXT,
  "drainAttemptToken" TEXT,
  "drainedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DatabaseRestoreConsumer_instanceId_kind_uid_key" ON "DatabaseRestoreConsumer"("instanceId", "kind", "uid");
CREATE INDEX "DatabaseRestoreConsumer_instanceId_state_idx" ON "DatabaseRestoreConsumer"("instanceId", "state");
