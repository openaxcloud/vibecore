CREATE TABLE "CollaborationPresence" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'online',
  "filePath" TEXT,
  "cursor" JSONB,
  "selection" JSONB,
  "mode" TEXT NOT NULL DEFAULT 'editing',
  "terminalAccess" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationPresence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborationComment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "filePath" TEXT,
  "line" INTEGER,
  "selection" JSONB,
  "body" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectShareLink" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollaborationPresence_projectId_sessionId_key" ON "CollaborationPresence"("projectId", "sessionId");
CREATE INDEX "CollaborationPresence_projectId_updatedAt_idx" ON "CollaborationPresence"("projectId", "updatedAt");
CREATE INDEX "CollaborationPresence_userId_idx" ON "CollaborationPresence"("userId");
CREATE INDEX "CollaborationComment_projectId_createdAt_idx" ON "CollaborationComment"("projectId", "createdAt");
CREATE INDEX "CollaborationComment_userId_idx" ON "CollaborationComment"("userId");
CREATE UNIQUE INDEX "ProjectShareLink_tokenHash_key" ON "ProjectShareLink"("tokenHash");
CREATE INDEX "ProjectShareLink_projectId_expiresAt_idx" ON "ProjectShareLink"("projectId", "expiresAt");

ALTER TABLE "CollaborationPresence" ADD CONSTRAINT "CollaborationPresence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationPresence" ADD CONSTRAINT "CollaborationPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationComment" ADD CONSTRAINT "CollaborationComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationComment" ADD CONSTRAINT "CollaborationComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectShareLink" ADD CONSTRAINT "ProjectShareLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectShareLink" ADD CONSTRAINT "ProjectShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
