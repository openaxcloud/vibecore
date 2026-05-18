-- Runtime/K8s state for services/workspace-manager, replacing the file-backed
-- JsonWorkspaceStore that prevented horizontal scaling of the orchestrator.
-- The id matches the workspaceId used by services/api (same id space as the
-- existing Workspace model, but with a different shape because this table
-- captures K8s lifecycle, not the user-facing IDE workspace).

CREATE TABLE "WorkspaceRuntime" (
  "id"                   TEXT PRIMARY KEY,
  "orgId"                TEXT NOT NULL,
  "projectId"            TEXT NOT NULL,
  "plan"                 JSONB NOT NULL,
  "status"               TEXT NOT NULL,
  "pvcName"              TEXT NOT NULL,
  "podName"              TEXT NOT NULL,
  "serviceName"          TEXT NOT NULL,
  "agentTokenSecretName" TEXT NOT NULL,
  "error"                TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActiveAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "WorkspaceRuntime_orgId_idx" ON "WorkspaceRuntime" ("orgId");
CREATE INDEX "WorkspaceRuntime_projectId_idx" ON "WorkspaceRuntime" ("projectId");
CREATE INDEX "WorkspaceRuntime_status_lastActiveAt_idx" ON "WorkspaceRuntime" ("status", "lastActiveAt");
