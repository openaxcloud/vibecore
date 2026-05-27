-- Persist the per-workspace git working tree path so each branch / agent
-- run has its own checkout without colliding with other workspaces of
-- the same project. Nullable: legacy workspaces created before this
-- column lazily fall back to the project's default git directory.

ALTER TABLE "Workspace" ADD COLUMN "gitPath" TEXT;
