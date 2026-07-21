-- CloudTenant / Project Factory / Platform IAM (DOMAIN_MODEL.md §3-4).
-- CloudTenant = the billing/quota/isolation boundary; CloudProjectBinding maps
-- it to GCP projects with I-TEN-1 (no project shared between two tenants)
-- enforced by a UNIQUE constraint. CloudTenantTransfer encodes
-- revoke-then-regrant. PlatformIamIdentity encodes the three execution
-- identities with the per-revision-identity anti-pattern made unrepresentable.

DO $$ BEGIN
  CREATE TYPE "CloudTenantBoundaryType" AS ENUM ('PERSON', 'WORKSPACE', 'LEGAL_ENTITY', 'BILLING_ACCOUNT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CloudTenantLifecycle" AS ENUM ('ACTIVE', 'SUSPENDED', 'MERGED', 'SPLIT', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CloudProjectBindingRole" AS ENUM ('PRIMARY', 'REGION_SHARD', 'QUOTA_SHARD', 'MIGRATION_TARGET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CloudProjectBindingState" AS ENUM ('REQUESTED', 'CREATING', 'BILLING_LINKED', 'APIS_ENABLING', 'SERVICE_AGENTS_READY', 'IAM_BOUND', 'EDGE_READY', 'ACTIVE', 'BILLING_SUSPENDED', 'QUOTA_EXHAUSTED', 'DRIFT_DETECTED', 'DELETE_REQUESTED', 'RECOVERY_WINDOW', 'RESTORING', 'PURGING', 'PURGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CloudTenantTransferState" AS ENUM ('REQUESTED', 'REVOKING', 'REVOKED', 'REGRANTING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformIamIdentityKind" AS ENUM ('BUILD', 'PROMOTION', 'RUNTIME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CloudTenant" (
    "id" TEXT NOT NULL,
    "customerBoundaryType" "CloudTenantBoundaryType" NOT NULL,
    "ownerPrincipalId" TEXT NOT NULL,
    "billingPrincipalId" TEXT NOT NULL,
    "legalEntityId" TEXT,
    "ownershipVersion" INTEGER NOT NULL DEFAULT 1,
    "residencyPolicy" TEXT NOT NULL DEFAULT 'eu',
    "lifecycle" "CloudTenantLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoTenantId" TEXT,
    "splitFromTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudTenant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CloudTenant_lifecycle_idx" ON "CloudTenant"("lifecycle");
CREATE INDEX IF NOT EXISTS "CloudTenant_ownerPrincipalId_idx" ON "CloudTenant"("ownerPrincipalId");

CREATE TABLE IF NOT EXISTS "CloudProjectBinding" (
    "id" TEXT NOT NULL,
    "cloudTenantId" TEXT NOT NULL,
    "gcpProjectId" TEXT NOT NULL,
    "gcpProjectNumber" TEXT,
    "role" "CloudProjectBindingRole" NOT NULL,
    "region" TEXT NOT NULL,
    "state" "CloudProjectBindingState" NOT NULL DEFAULT 'REQUESTED',
    "parentFolderId" TEXT,
    "quotas" JSONB,
    "billingLabels" JSONB,
    "capacityPolicy" JSONB,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "recoveryWindowEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudProjectBinding_pkey" PRIMARY KEY ("id")
);

-- I-TEN-1: a GCP project belongs to AT MOST one tenant. This UNIQUE is the
-- invariant — application code returns the typed error, the constraint makes
-- the violation impossible even for a buggy writer.
CREATE UNIQUE INDEX IF NOT EXISTS "CloudProjectBinding_gcpProjectId_key" ON "CloudProjectBinding"("gcpProjectId");
CREATE UNIQUE INDEX IF NOT EXISTS "CloudProjectBinding_gcpProjectNumber_key" ON "CloudProjectBinding"("gcpProjectNumber");
CREATE INDEX IF NOT EXISTS "CloudProjectBinding_cloudTenantId_role_idx" ON "CloudProjectBinding"("cloudTenantId", "role");
CREATE INDEX IF NOT EXISTS "CloudProjectBinding_state_idx" ON "CloudProjectBinding"("state");
CREATE INDEX IF NOT EXISTS "CloudProjectBinding_parentFolderId_idx" ON "CloudProjectBinding"("parentFolderId");

CREATE TABLE IF NOT EXISTS "CloudProjectFactoryEvent" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "actor" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudProjectFactoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CloudProjectFactoryEvent_bindingId_createdAt_idx" ON "CloudProjectFactoryEvent"("bindingId", "createdAt");

CREATE TABLE IF NOT EXISTS "CloudTenantTransfer" (
    "id" TEXT NOT NULL,
    "cloudTenantId" TEXT NOT NULL,
    "fromPrincipalId" TEXT NOT NULL,
    "toPrincipalId" TEXT NOT NULL,
    "state" "CloudTenantTransferState" NOT NULL DEFAULT 'REQUESTED',
    "revokeEvidence" JSONB,
    "revokeVerifiedAt" TIMESTAMP(3),
    "regrantEvidence" JSONB,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudTenantTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CloudTenantTransfer_cloudTenantId_createdAt_idx" ON "CloudTenantTransfer"("cloudTenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "CloudTenantTransfer_state_idx" ON "CloudTenantTransfer"("state");

CREATE TABLE IF NOT EXISTS "CloudTeardownRecord" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVENTORYING',
    "resourceInventory" JSONB,
    "erasureProof" JSONB,
    "orphans" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CloudTeardownRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CloudTeardownRecord_bindingId_startedAt_idx" ON "CloudTeardownRecord"("bindingId", "startedAt");

CREATE TABLE IF NOT EXISTS "PlatformIamIdentity" (
    "id" TEXT NOT NULL,
    "kind" "PlatformIamIdentityKind" NOT NULL,
    "app" TEXT NOT NULL DEFAULT '',
    "environment" TEXT NOT NULL DEFAULT '',
    "privilegeBoundary" TEXT NOT NULL,
    "gcpProjectId" TEXT NOT NULL,
    "gcpServiceAccountEmail" TEXT NOT NULL,
    "persistentKeys" INTEGER NOT NULL DEFAULT 0,
    "revisionsServed" INTEGER NOT NULL DEFAULT 0,
    "lastRotatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformIamIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformIamIdentity_gcpServiceAccountEmail_key" ON "PlatformIamIdentity"("gcpServiceAccountEmail");
-- I-IAM-1: one identity per app × environment × privilege boundary (× project),
-- reused by every revision. A per-revision identity has nowhere to live.
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformIamIdentity_kind_app_environment_privilegeBoundary_key" ON "PlatformIamIdentity"("kind", "app", "environment", "privilegeBoundary", "gcpProjectId");
CREATE INDEX IF NOT EXISTS "PlatformIamIdentity_gcpProjectId_kind_idx" ON "PlatformIamIdentity"("gcpProjectId", "kind");

CREATE TABLE IF NOT EXISTS "PlatformIamImpersonationAudit" (
    "id" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "actorPrincipal" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenLifetimeSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformIamImpersonationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformIamImpersonationAudit_identityId_createdAt_idx" ON "PlatformIamImpersonationAudit"("identityId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CloudProjectBinding" ADD CONSTRAINT "CloudProjectBinding_cloudTenantId_fkey" FOREIGN KEY ("cloudTenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CloudProjectFactoryEvent" ADD CONSTRAINT "CloudProjectFactoryEvent_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CloudProjectBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CloudTenantTransfer" ADD CONSTRAINT "CloudTenantTransfer_cloudTenantId_fkey" FOREIGN KEY ("cloudTenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CloudTeardownRecord" ADD CONSTRAINT "CloudTeardownRecord_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CloudProjectBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PlatformIamImpersonationAudit" ADD CONSTRAINT "PlatformIamImpersonationAudit_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PlatformIamIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
