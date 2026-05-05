CREATE TABLE "AgentMemoryPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "projectId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentMemoryPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentMemoryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentMemoryPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentMemoryPreference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentMemoryPreference_user_global_key"
  ON "AgentMemoryPreference" ("userId")
  WHERE "organizationId" IS NULL AND "projectId" IS NULL;

CREATE UNIQUE INDEX "AgentMemoryPreference_user_org_key"
  ON "AgentMemoryPreference" ("userId", "organizationId")
  WHERE "organizationId" IS NOT NULL AND "projectId" IS NULL;

CREATE UNIQUE INDEX "AgentMemoryPreference_user_project_key"
  ON "AgentMemoryPreference" ("userId", "projectId")
  WHERE "projectId" IS NOT NULL;

CREATE INDEX "AgentMemoryPreference_user_updated_idx" ON "AgentMemoryPreference" ("userId", "updatedAt");
CREATE INDEX "AgentMemoryPreference_organization_updated_idx" ON "AgentMemoryPreference" ("organizationId", "updatedAt");
CREATE INDEX "AgentMemoryPreference_project_updated_idx" ON "AgentMemoryPreference" ("projectId", "updatedAt");
