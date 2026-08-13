-- 0079_skill_interop_audit — interoperable Agent Skills: provenance, security
-- audit, and revoke (RPL-SK-001.3 / .4). PURELY ADDITIVE: new nullable columns on
-- "InstalledSkill" (existing rows default cleanly) + one new append-only journal
-- table "SkillAuditEvent". No drops, no data backfill required.

-- AlterTable: provenance + audit + revoke columns on InstalledSkill.
ALTER TABLE "InstalledSkill" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'github';
ALTER TABLE "InstalledSkill" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "InstalledSkill" ADD COLUMN "auditVerdict" TEXT;
ALTER TABLE "InstalledSkill" ADD COLUMN "auditFindings" TEXT;
ALTER TABLE "InstalledSkill" ADD COLUMN "auditedAt" TIMESTAMP(3);
ALTER TABLE "InstalledSkill" ADD COLUMN "manifestName" TEXT;
ALTER TABLE "InstalledSkill" ADD COLUMN "resourcesJson" TEXT;
ALTER TABLE "InstalledSkill" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "InstalledSkill" ADD COLUMN "revokedByUserId" TEXT;
ALTER TABLE "InstalledSkill" ADD COLUMN "revokeReason" TEXT;

-- CreateTable: append-only skill audit journal.
CREATE TABLE "SkillAuditEvent" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "ownerRepo" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "verdict" TEXT,
    "findingsJson" TEXT,
    "contentHash" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillAuditEvent_scope_scopeId_idx" ON "SkillAuditEvent"("scope", "scopeId");
CREATE INDEX "SkillAuditEvent_ownerRepo_idx" ON "SkillAuditEvent"("ownerRepo");
CREATE INDEX "SkillAuditEvent_createdAt_idx" ON "SkillAuditEvent"("createdAt");
