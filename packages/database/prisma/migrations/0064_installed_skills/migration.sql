-- Installable GitHub-repo Skills catalog (F#27, 2026-07-09). ADDITIVE ONLY — one
-- brand-new "InstalledSkill" table; no ALTER/DROP/RENAME on any existing object.
-- A row records a public GitHub skill repo that a project (or its workspace) has
-- installed, along with the instructions fetched from the repo at install time.
-- The builtin catalog (ProjectSkill + skills-catalog.ts) is untouched and keeps
-- working; installed skills are layered ON TOP of it. Fully reversible:
-- DROP TABLE "InstalledSkill".

-- CreateTable
CREATE TABLE "InstalledSkill" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "ownerRepo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "homepageUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one install per repo per scope target (project or workspace)
CREATE UNIQUE INDEX "InstalledSkill_scope_scopeId_ownerRepo_key" ON "InstalledSkill"("scope", "scopeId", "ownerRepo");

-- CreateIndex: list a scope target's installed skills
CREATE INDEX "InstalledSkill_scope_scopeId_idx" ON "InstalledSkill"("scope", "scopeId");

-- CreateIndex: aggregate install counts per repo for the community catalog
CREATE INDEX "InstalledSkill_ownerRepo_idx" ON "InstalledSkill"("ownerRepo");
