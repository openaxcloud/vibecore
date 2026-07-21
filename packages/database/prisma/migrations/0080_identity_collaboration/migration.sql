-- Identity & collaboration (IDENTITY_COLLABORATION_CONTRACT / P0-EX-07).
-- Adds the measured gaps: Group (+GroupMember, SCIM-manageable), the generic
-- ResourceAccessGrant (subject user|group, typed resource, expiry + explicit
-- revocation + grantedBy audit) and the contract's Membership fields
-- (state, invitedBy, joinedAt) on OrganizationMember.

DO $$ BEGIN
  CREATE TYPE "AccessGrantSubjectType" AS ENUM ('USER', 'GROUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AccessGrantResourceType" AS ENUM ('PROJECT', 'ARTIFACT', 'DEPLOYMENT', 'DATASET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "OrganizationMember" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "OrganizationMember" ADD COLUMN IF NOT EXISTS "invitedByUserId" TEXT;
ALTER TABLE "OrganizationMember" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "Group" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scimManaged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Group_organizationId_name_key" ON "Group"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "Group_organizationId_idx" ON "Group"("organizationId");

CREATE TABLE IF NOT EXISTS "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "GroupMember_userId_idx" ON "GroupMember"("userId");

CREATE TABLE IF NOT EXISTS "ResourceAccessGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectType" "AccessGrantSubjectType" NOT NULL,
    "subjectUserId" TEXT,
    "subjectGroupId" TEXT,
    "resourceType" "AccessGrantResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ResourceAccessGrant_resourceType_resourceId_idx" ON "ResourceAccessGrant"("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "ResourceAccessGrant_subjectUserId_idx" ON "ResourceAccessGrant"("subjectUserId");
CREATE INDEX IF NOT EXISTS "ResourceAccessGrant_subjectGroupId_idx" ON "ResourceAccessGrant"("subjectGroupId");
CREATE INDEX IF NOT EXISTS "ResourceAccessGrant_organizationId_idx" ON "ResourceAccessGrant"("organizationId");

DO $$ BEGIN
  ALTER TABLE "Group" ADD CONSTRAINT "Group_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ResourceAccessGrant" ADD CONSTRAINT "ResourceAccessGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ResourceAccessGrant" ADD CONSTRAINT "ResourceAccessGrant_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ResourceAccessGrant" ADD CONSTRAINT "ResourceAccessGrant_subjectGroupId_fkey" FOREIGN KEY ("subjectGroupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ResourceAccessGrant" ADD CONSTRAINT "ResourceAccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
