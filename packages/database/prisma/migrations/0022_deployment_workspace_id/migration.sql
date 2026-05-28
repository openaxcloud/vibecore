-- Per-workspace deployments. Until now, all deployments rooted at the project
-- folder regardless of which workspace (branch / agent checkout) initiated
-- them. The new nullable `workspaceId` lets us scope a build to a workspace's
-- secondary checkout under `.vibecore-workspaces/<workspaceId>/` while keeping
-- backward compatibility — pre-existing rows stay project-level (NULL).
ALTER TABLE "Deployment" ADD COLUMN "workspaceId" TEXT;

CREATE INDEX "Deployment_projectId_workspaceId_idx"
    ON "Deployment" ("projectId", "workspaceId");
