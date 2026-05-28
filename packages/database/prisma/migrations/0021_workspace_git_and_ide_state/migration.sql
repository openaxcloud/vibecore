-- Store a workspace-scoped git remote URL so different workspaces (branches,
-- agent runs, personal forks) can point at different remotes without all
-- relying on Project.gitRepositoryUrl. Nullable: existing workspaces inherit
-- the project-level remote until the user configures one explicitly.
ALTER TABLE "Workspace" ADD COLUMN "gitRepositoryUrl" TEXT;

-- Mirror ProjectIdeState per-workspace so each working tree can keep its
-- own editor cursor, open file manifest, and unsaved buffers. Falls back
-- to ProjectIdeState in application code when a workspace has no row yet.
CREATE TABLE "WorkspaceIdeState" (
    "workspaceId"     TEXT NOT NULL,
    "state"           JSONB NOT NULL,
    "version"         INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceIdeState_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceIdeState"
    ADD CONSTRAINT "WorkspaceIdeState_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
