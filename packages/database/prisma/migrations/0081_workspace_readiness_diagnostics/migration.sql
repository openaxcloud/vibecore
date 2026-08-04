-- BLOCKER #5/#6: honest preview readiness beacons + workspace diagnostics/lifecycle.

CREATE TABLE "PreviewReadinessBeacon" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreviewReadinessBeacon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PreviewReadinessBeacon_workspaceId_port_key" ON "PreviewReadinessBeacon"("workspaceId", "port");
CREATE INDEX "PreviewReadinessBeacon_workspaceId_idx" ON "PreviewReadinessBeacon"("workspaceId");
ALTER TABLE "PreviewReadinessBeacon" ADD CONSTRAINT "PreviewReadinessBeacon_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceLifecycleEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "reason" TEXT,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceLifecycleEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkspaceLifecycleEvent_workspaceId_at_idx" ON "WorkspaceLifecycleEvent"("workspaceId", "at");
ALTER TABLE "WorkspaceLifecycleEvent" ADD CONSTRAINT "WorkspaceLifecycleEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspacePostMortem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "finalState" TEXT NOT NULL,
    "ports" JSONB,
    "processes" JSONB,
    "problems" JSONB,
    "logsTail" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspacePostMortem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkspacePostMortem_workspaceId_capturedAt_idx" ON "WorkspacePostMortem"("workspaceId", "capturedAt");
ALTER TABLE "WorkspacePostMortem" ADD CONSTRAINT "WorkspacePostMortem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
