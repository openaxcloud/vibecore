-- Retain scheduled-run identities after a user deletes a task. The task and
-- its runs are removed only by the project permanent-deletion finalizer, after
-- Kubernetes Pod/Secret absence has been proven.
ALTER TABLE "ScheduledTask"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

DROP INDEX "ScheduledTask_projectId_kind_workflowId_key";

CREATE UNIQUE INDEX "ScheduledTask_projectId_kind_workflowId_key"
  ON "ScheduledTask"("projectId", kind, "workflowId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "ScheduledTask_projectId_deletedAt_idx"
  ON "ScheduledTask"("projectId", "deletedAt");
