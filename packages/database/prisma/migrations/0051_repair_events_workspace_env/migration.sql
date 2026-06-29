-- (1a) Durable agent self-repair history for the IDE review UI; (2) P2d
-- Workspace.environment for the production checkout. Both additive + nullable/
-- defaulted, so existing rows and behaviour are unaffected.
CREATE TABLE IF NOT EXISTS "AgentRepairEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "messageId" TEXT,
    "artifactId" TEXT,
    "actionId" TEXT,
    "relativePath" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "outcome" TEXT NOT NULL,
    "validationError" TEXT,
    "repairError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRepairEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentRepairEvent_projectId_createdAt_idx" ON "AgentRepairEvent"("projectId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "AgentRepairEvent" ADD CONSTRAINT "AgentRepairEvent_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'development';
