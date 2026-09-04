-- Open Agent Skills artifact/audit pipeline (2026-07-15).
-- External source content is immutable by (commit SHA, SHA-256 digest), starts
-- inactive, and requires a persisted reviewer decision before workspace install.

-- This product has no legacy-user compatibility constraint: remove the former
-- proprietary catalogue/install storage instead of keeping two executable skill
-- systems alive beside the open `.agents/skills` standard.
DROP TABLE IF EXISTS "ProjectSkill" CASCADE;
DROP TABLE IF EXISTS "InstalledSkill" CASCADE;

CREATE TABLE "AgentSkillArtifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceKey" TEXT NOT NULL,
    "ownerRepo" TEXT NOT NULL,
    "skillPath" TEXT NOT NULL,
    "requestedRef" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "license" TEXT,
    "compatibility" TEXT,
    "declaredAllowedTools" TEXT,
    "bundle" JSONB NOT NULL,
    "auditStatus" TEXT NOT NULL,
    "auditReport" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "installedPath" TEXT,
    "importedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkillArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentSkillAuditEvent" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSkillAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentSkillArtifact_workspace_source_digest_key"
  ON "AgentSkillArtifact"("projectId", "workspaceKey", "ownerRepo", "skillPath", "digest");
CREATE INDEX "AgentSkillArtifact_workspace_status_updated_idx"
  ON "AgentSkillArtifact"("projectId", "workspaceKey", "auditStatus", "updatedAt");
CREATE INDEX "AgentSkillArtifact_workspace_name_enabled_idx"
  ON "AgentSkillArtifact"("projectId", "workspaceKey", "name", "enabled");
CREATE INDEX "AgentSkillArtifact_digest_idx" ON "AgentSkillArtifact"("digest");
CREATE INDEX "AgentSkillAuditEvent_artifact_cursor_idx"
  ON "AgentSkillAuditEvent"("artifactId", "createdAt", "id");
CREATE INDEX "AgentSkillAuditEvent_actorUserId_createdAt_idx"
  ON "AgentSkillAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "AgentSkillArtifact"
  ADD CONSTRAINT "AgentSkillArtifact_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentSkillAuditEvent"
  ADD CONSTRAINT "AgentSkillAuditEvent_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "AgentSkillArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
