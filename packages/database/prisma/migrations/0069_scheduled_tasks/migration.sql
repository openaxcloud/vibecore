-- Scheduled tasks (cron) — the executor backing both the Workflows panel
-- schedules and the "Scheduled" deployment type.
--
-- Before this migration, cron expressions were persisted in a project env-var
-- JSON blob and a nextRunAt was computed, but no process ever fired them. These
-- two tables make a schedule a real, claimable, auditable, billable unit of work.
--
-- Claim model: the scheduler advances `nextRunAt` inside a conditional UPDATE
-- (`WHERE id = $1 AND "nextRunAt" = $2`), so exactly one api replica can own a
-- given tick. The partial-friendly index below serves that hot scan.

CREATE TYPE "ScheduledTaskKind" AS ENUM ('WORKFLOW', 'DEPLOYMENT');

CREATE TYPE "ScheduledTaskRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'TIMED_OUT', 'SKIPPED', 'CANCELED');

CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ScheduledTaskKind" NOT NULL DEFAULT 'DEPLOYMENT',
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL DEFAULT '',
    "workflowId" INTEGER,
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "machineSize" TEXT NOT NULL DEFAULT 'shared-0.5',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 900,
    "concurrency" TEXT NOT NULL DEFAULT 'FORBID',
    "maxRetries" INTEGER NOT NULL DEFAULT 0,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledTaskRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ScheduledTaskRunStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "exitCode" INTEGER,
    "logs" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "machineSize" TEXT,
    "computeUnits" DOUBLE PRECISION,
    "costCents" DOUBLE PRECISION,
    "meteredAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledTaskRun_pkey" PRIMARY KEY ("id")
);

-- The scheduler's hot query: enabled tasks whose nextRunAt is due.
CREATE INDEX "ScheduledTask_enabled_nextRunAt_idx" ON "ScheduledTask"("enabled", "nextRunAt");
CREATE INDEX "ScheduledTask_projectId_idx" ON "ScheduledTask"("projectId");
CREATE INDEX "ScheduledTask_organizationId_idx" ON "ScheduledTask"("organizationId");

-- One schedule per workflow. DEPLOYMENT rows carry a NULL workflowId, and NULLs
-- are distinct in Postgres, so a project can still hold many scheduled commands.
CREATE UNIQUE INDEX "ScheduledTask_projectId_kind_workflowId_key" ON "ScheduledTask"("projectId", "kind", "workflowId");

CREATE INDEX "ScheduledTaskRun_taskId_startedAt_idx" ON "ScheduledTaskRun"("taskId", "startedAt");
CREATE INDEX "ScheduledTaskRun_projectId_startedAt_idx" ON "ScheduledTaskRun"("projectId", "startedAt");
CREATE INDEX "ScheduledTaskRun_status_idx" ON "ScheduledTaskRun"("status");

ALTER TABLE "ScheduledTaskRun" ADD CONSTRAINT "ScheduledTaskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
