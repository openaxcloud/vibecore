-- Skills registry (2026-06-29): per-project enable/disable overrides for the
-- builtin Skills catalog (code-owned static list in skills-catalog.ts). A row
-- exists only when a project toggled a skill away from its catalog default;
-- absent => default. skillId is the catalog slug. Additive + inert: nothing
-- reads this table until the IDE Skills panel calls the /projects/:id/skills
-- routes, so deploying the migration changes no existing behaviour.
CREATE TABLE IF NOT EXISTS "ProjectSkill" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectSkill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectSkill_projectId_skillId_key" ON "ProjectSkill"("projectId", "skillId");
CREATE INDEX IF NOT EXISTS "ProjectSkill_projectId_idx" ON "ProjectSkill"("projectId");

DO $$ BEGIN
  ALTER TABLE "ProjectSkill" ADD CONSTRAINT "ProjectSkill_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
