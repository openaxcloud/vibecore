CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "AgentMemory" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "projectId" TEXT,
  "sessionId" TEXT,
  "scope" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "embeddingDimensions" INTEGER NOT NULL DEFAULT 1536,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentMemory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentMemory_scope_check" CHECK ("scope" IN ('user', 'organization', 'project', 'session')),
  CONSTRAINT "AgentMemory_importance_check" CHECK ("importance" >= 0 AND "importance" <= 1),
  CONSTRAINT "AgentMemory_embedding_dimensions_check" CHECK ("embeddingDimensions" = 1536)
);

CREATE INDEX "AgentMemory_user_scope_idx" ON "AgentMemory"("userId", "scope", "updatedAt");
CREATE INDEX "AgentMemory_org_idx" ON "AgentMemory"("organizationId", "updatedAt") WHERE "organizationId" IS NOT NULL;
CREATE INDEX "AgentMemory_project_idx" ON "AgentMemory"("projectId", "updatedAt") WHERE "projectId" IS NOT NULL;
CREATE INDEX "AgentMemory_session_idx" ON "AgentMemory"("sessionId", "updatedAt") WHERE "sessionId" IS NOT NULL;
CREATE INDEX "AgentMemory_active_idx" ON "AgentMemory"("userId", "archivedAt", "expiresAt");
CREATE INDEX "AgentMemory_embedding_hnsw" ON "AgentMemory" USING hnsw ("embedding" vector_cosine_ops);

CREATE OR REPLACE FUNCTION update_agent_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AgentMemory_updatedAt"
BEFORE UPDATE ON "AgentMemory"
FOR EACH ROW
EXECUTE FUNCTION update_agent_memory_updated_at();
