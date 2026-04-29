-- Persistent SaaS project metadata and storage indexes.

ALTER TABLE "Project" ADD COLUMN "description" TEXT;
ALTER TABLE "Project" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'blank';
ALTER TABLE "Project" ADD COLUMN "templateName" TEXT;
ALTER TABLE "Project" ADD COLUMN "gitRepositoryUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "gitDefaultBranch" TEXT;
ALTER TABLE "Project" ADD COLUMN "persistentVolumeClaim" TEXT;
ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "ProjectSecret" ADD COLUMN "valueEncrypted" TEXT;
ALTER TABLE "ProjectSecret" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ProjectSnapshot" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "ProjectSnapshot" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "ProjectSnapshot" ADD COLUMN "byteLength" INTEGER;
ALTER TABLE "ProjectSnapshot" ADD COLUMN "createdByUserId" TEXT;

CREATE TABLE "ProjectEnvVar" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectEnvVar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectCollaborator" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectCollaborator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "sourceProjectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectEnvVar_projectId_key_key" ON "ProjectEnvVar"("projectId", "key");
CREATE UNIQUE INDEX "ProjectCollaborator_projectId_userId_key" ON "ProjectCollaborator"("projectId", "userId");
CREATE INDEX "ProjectCollaborator_userId_idx" ON "ProjectCollaborator"("userId");
CREATE INDEX "ProjectActivity_projectId_idx" ON "ProjectActivity"("projectId");
CREATE INDEX "ProjectActivity_actorUserId_idx" ON "ProjectActivity"("actorUserId");
CREATE INDEX "ProjectTemplate_organizationId_idx" ON "ProjectTemplate"("organizationId");
CREATE INDEX "ProjectSnapshot_createdByUserId_idx" ON "ProjectSnapshot"("createdByUserId");

ALTER TABLE "ProjectEnvVar" ADD CONSTRAINT "ProjectEnvVar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectActivity" ADD CONSTRAINT "ProjectActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectSnapshot" ADD CONSTRAINT "ProjectSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
