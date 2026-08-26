-- P0-EX-07 — durable identity/collaboration domain.
--
-- Security invariants are enforced twice: in the API and here at the data
-- boundary.  In particular, a group member must reference an OrganizationMember
-- in the SAME organization, and an AccessGrant has exactly one subject.

CREATE TYPE "OrganizationMembershipState" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "CollaborationGroupSource" AS ENUM ('MANUAL', 'SCIM');
CREATE TYPE "AccessGrantSubjectType" AS ENUM ('USER', 'GROUP');
CREATE TYPE "AccessGrantResourceType" AS ENUM ('PROJECT', 'ARTIFACT', 'DEPLOYMENT', 'DATASET');
CREATE TYPE "AccessGrantStatus" AS ENUM ('PENDING_CONSENT', 'ACTIVE', 'REVOKED');

ALTER TABLE "OrganizationMember"
  ADD COLUMN "state" "OrganizationMembershipState" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "invitedByUserId" TEXT,
  ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "OrganizationMember_organizationId_id_key"
  ON "OrganizationMember"("organizationId", "id");
CREATE INDEX "OrganizationMember_invitedByUserId_idx"
  ON "OrganizationMember"("invitedByUserId");
ALTER TABLE "OrganizationMember"
  ADD CONSTRAINT "OrganizationMember_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationInvite"
  ADD COLUMN "createdByUserId" TEXT;
CREATE INDEX "OrganizationInvite_createdByUserId_idx"
  ON "OrganizationInvite"("createdByUserId");
ALTER TABLE "OrganizationInvite"
  ADD CONSTRAINT "OrganizationInvite_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CollaborationGroup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "source" "CollaborationGroupSource" NOT NULL DEFAULT 'MANUAL',
  "externalId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollaborationGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollaborationGroup_organizationId_id_key"
  ON "CollaborationGroup"("organizationId", "id");
CREATE UNIQUE INDEX "CollaborationGroup_live_name_key"
  ON "CollaborationGroup"("organizationId", "normalizedName")
  WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "CollaborationGroup_scim_externalId_key"
  ON "CollaborationGroup"("organizationId", "externalId")
  WHERE "externalId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX "CollaborationGroup_organizationId_deletedAt_id_idx"
  ON "CollaborationGroup"("organizationId", "deletedAt", "id");
ALTER TABLE "CollaborationGroup"
  ADD CONSTRAINT "CollaborationGroup_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CollaborationGroupMember" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollaborationGroupMember_groupId_membershipId_key"
  ON "CollaborationGroupMember"("groupId", "membershipId");
CREATE INDEX "CollaborationGroupMember_organizationId_membershipId_idx"
  ON "CollaborationGroupMember"("organizationId", "membershipId");
ALTER TABLE "CollaborationGroupMember"
  ADD CONSTRAINT "CollaborationGroupMember_group_tenant_fkey"
  FOREIGN KEY ("organizationId", "groupId")
  REFERENCES "CollaborationGroup"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationGroupMember"
  ADD CONSTRAINT "CollaborationGroupMember_membership_tenant_fkey"
  FOREIGN KEY ("organizationId", "membershipId")
  REFERENCES "OrganizationMember"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ResourceAccessGrant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subjectType" "AccessGrantSubjectType" NOT NULL,
  "subjectUserId" TEXT,
  "subjectGroupId" TEXT,
  "resourceType" "AccessGrantResourceType" NOT NULL,
  "resourceId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "status" "AccessGrantStatus" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "consentVersion" TEXT,
  "grantedByUserId" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "revocationReason" TEXT,
  "idempotencyKey" TEXT,
  "requestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceAccessGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResourceAccessGrant_exactly_one_subject_check" CHECK (
    ("subjectType" = 'USER' AND "subjectUserId" IS NOT NULL AND "subjectGroupId" IS NULL)
    OR
    ("subjectType" = 'GROUP' AND "subjectUserId" IS NULL AND "subjectGroupId" IS NOT NULL)
  ),
  CONSTRAINT "ResourceAccessGrant_expiry_after_creation_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "ResourceAccessGrant_status_timestamps_check" CHECK (
    ("status" = 'PENDING_CONSENT' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL)
    OR
    ("status" = 'ACTIVE' AND "acceptedAt" IS NOT NULL AND "revokedAt" IS NULL)
    OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ResourceAccessGrant_organizationId_idempotencyKey_key"
  ON "ResourceAccessGrant"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "ResourceAccessGrant_live_subject_resource_key"
  ON "ResourceAccessGrant"(
    "organizationId",
    "subjectType",
    COALESCE("subjectUserId", ''),
    COALESCE("subjectGroupId", ''),
    "resourceType",
    "resourceId"
  ) WHERE "status" <> 'REVOKED';
CREATE INDEX "ResourceAccessGrant_resource_lookup_idx"
  ON "ResourceAccessGrant"("resourceType", "resourceId", "status", "expiresAt");
CREATE INDEX "ResourceAccessGrant_subjectUserId_status_expiresAt_idx"
  ON "ResourceAccessGrant"("subjectUserId", "status", "expiresAt");
CREATE INDEX "ResourceAccessGrant_subjectGroupId_status_expiresAt_idx"
  ON "ResourceAccessGrant"("subjectGroupId", "status", "expiresAt");
CREATE INDEX "ResourceAccessGrant_organizationId_createdAt_id_idx"
  ON "ResourceAccessGrant"("organizationId", "createdAt", "id");

ALTER TABLE "ResourceAccessGrant"
  ADD CONSTRAINT "ResourceAccessGrant_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAccessGrant"
  ADD CONSTRAINT "ResourceAccessGrant_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceAccessGrant"
  ADD CONSTRAINT "ResourceAccessGrant_subjectGroup_tenant_fkey"
  FOREIGN KEY ("organizationId", "subjectGroupId")
  REFERENCES "CollaborationGroup"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceAccessGrant"
  ADD CONSTRAINT "ResourceAccessGrant_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceAccessGrant"
  ADD CONSTRAINT "ResourceAccessGrant_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
