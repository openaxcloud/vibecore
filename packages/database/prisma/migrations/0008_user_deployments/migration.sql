ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "environmentName" TEXT NOT NULL DEFAULT 'preview';
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "previewUrl" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "productionUrl" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "framework" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "buildCommand" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "outputDirectory" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "branch" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "commitSha" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "logs" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "rolledBackFromId" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3);
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Deployment_projectId_environmentName_idx" ON "Deployment"("projectId", "environmentName");
CREATE INDEX IF NOT EXISTS "Deployment_projectId_status_idx" ON "Deployment"("projectId", "status");
