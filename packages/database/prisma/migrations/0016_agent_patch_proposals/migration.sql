-- Persists the AI-generated patch review queue across workbench reloads.
-- Terminal-state proposals (accepted/rejected/reverted) are hard-deleted by
-- the application — the audit trail lives in ProjectActivity, this table is
-- a working buffer for proposals the user has yet to decide on. The id is
-- the "artifactId:actionId" composite the streaming runner already uses on
-- the client, so the nanostore key and the row id stay in 1:1 correspondence.

CREATE TABLE "AgentPatchProposal" (
  "id"              TEXT PRIMARY KEY,
  "projectId"       TEXT NOT NULL,
  "artifactId"      TEXT NOT NULL,
  "messageId"       TEXT NOT NULL,
  "actionId"        TEXT NOT NULL,
  "filePath"        TEXT NOT NULL,
  "relativePath"    TEXT NOT NULL,
  "originalContent" TEXT NOT NULL,
  "proposedContent" TEXT NOT NULL,
  "hunks"           JSONB NOT NULL,
  "status"          TEXT NOT NULL,
  "error"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentPatchProposal_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AgentPatchProposal_projectId_status_idx"    ON "AgentPatchProposal" ("projectId", "status");
CREATE INDEX "AgentPatchProposal_projectId_updatedAt_idx" ON "AgentPatchProposal" ("projectId", "updatedAt");
