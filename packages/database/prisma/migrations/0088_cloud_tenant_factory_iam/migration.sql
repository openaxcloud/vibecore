-- P0-V3-04: durable CloudTenant / Project Factory / IAM control plane.
-- 0087 is intentionally reserved for the remix workstream.

CREATE TYPE "CloudTenantBoundaryType" AS ENUM ('PERSON', 'WORKSPACE', 'LEGAL_ENTITY', 'BILLING_ACCOUNT');
CREATE TYPE "CloudTenantLifecycle" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'MERGED', 'CLOSED');
CREATE TYPE "CloudProjectBindingRole" AS ENUM ('PRIMARY', 'REGION_SHARD', 'QUOTA_SHARD', 'MIGRATION_TARGET');
CREATE TYPE "CloudProjectBindingState" AS ENUM (
  'REQUESTED', 'CREATING', 'BILLING_LINKED', 'APIS_ENABLING',
  'SERVICE_AGENTS_READY', 'IAM_BOUND', 'EDGE_READY', 'ACTIVE',
  'BILLING_SUSPENDED', 'QUOTA_EXHAUSTED', 'DRIFT_DETECTED',
  'DELETE_REQUESTED', 'RECOVERY_WINDOW', 'RESTORING', 'PURGING', 'PURGED'
);
CREATE TYPE "CloudTenantTransferState" AS ENUM ('REQUESTED', 'REVOKING', 'REVOKED', 'REGRANTING', 'COMPLETED', 'FAILED');
CREATE TYPE "CloudOperationKind" AS ENUM (
  'TENANT_CREATE', 'PROJECT_BIND', 'TENANT_SUSPEND', 'TENANT_RESTORE',
  'TENANT_MERGE', 'TENANT_SPLIT', 'TENANT_TRANSFER', 'PROJECT_ADVANCE',
  'TEARDOWN_REQUEST', 'TEARDOWN_EXECUTE', 'TEARDOWN_VERIFY',
  'PROJECT_RESTORE', 'PROJECT_PURGE', 'IAM_ENSURE'
);
CREATE TYPE "CloudOperationStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "CloudTeardownStatus" AS ENUM ('INVENTORYING', 'DELETING', 'VERIFYING', 'COMPLETE', 'ORPHANS_DETECTED', 'FAILED');
CREATE TYPE "PlatformIamIdentityKind" AS ENUM ('BUILD', 'PROMOTION', 'RUNTIME');
CREATE TYPE "PlatformIamComplianceStatus" AS ENUM ('UNKNOWN', 'COMPLIANT', 'KEY_DRIFT', 'DISABLED');

CREATE TABLE "CloudTenant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "customerBoundaryType" "CloudTenantBoundaryType" NOT NULL,
  "ownerPrincipalId" TEXT NOT NULL,
  "billingPrincipalId" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "legalEntityId" TEXT,
  "residencyPolicy" TEXT NOT NULL DEFAULT 'eu',
  "lifecycle" "CloudTenantLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "suspensionReason" TEXT,
  "suspensionEvidence" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "ownershipVersion" INTEGER NOT NULL DEFAULT 1,
  "mergedIntoTenantId" TEXT,
  "splitFromTenantId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CloudTenant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CloudTenant_version_check" CHECK ("version" > 0 AND "ownershipVersion" > 0)
);

CREATE UNIQUE INDEX "CloudTenant_organizationId_key" ON "CloudTenant"("organizationId");
CREATE INDEX "CloudTenant_lifecycle_idx" ON "CloudTenant"("lifecycle");
CREATE INDEX "CloudTenant_ownerPrincipalId_idx" ON "CloudTenant"("ownerPrincipalId");

CREATE TABLE "CloudProjectBinding" (
  "id" TEXT NOT NULL,
  "cloudTenantId" TEXT NOT NULL,
  "projectId" TEXT,
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
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CloudProjectBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CloudProjectBinding_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "CloudProjectBinding_projectId_key" ON "CloudProjectBinding"("projectId");
CREATE UNIQUE INDEX "CloudProjectBinding_gcpProjectId_key" ON "CloudProjectBinding"("gcpProjectId");
CREATE UNIQUE INDEX "CloudProjectBinding_gcpProjectNumber_key" ON "CloudProjectBinding"("gcpProjectNumber");
-- A race cannot create two live primaries for one tenant. PURGED rows remain a
-- permanent GCP project-id reservation but no longer occupy the primary slot.
CREATE UNIQUE INDEX "CloudProjectBinding_one_live_primary_key"
  ON "CloudProjectBinding"("cloudTenantId")
  WHERE "role" = 'PRIMARY' AND "state" <> 'PURGED';
CREATE INDEX "CloudProjectBinding_cloudTenantId_state_idx" ON "CloudProjectBinding"("cloudTenantId", "state");
CREATE INDEX "CloudProjectBinding_state_idx" ON "CloudProjectBinding"("state");
CREATE INDEX "CloudProjectBinding_parentFolderId_idx" ON "CloudProjectBinding"("parentFolderId");

CREATE TABLE "CloudProjectFactoryEvent" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "operationId" TEXT,
  "fromState" TEXT,
  "toState" TEXT NOT NULL,
  "actorUserId" TEXT,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CloudProjectFactoryEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CloudProjectFactoryEvent_bindingId_createdAt_idx" ON "CloudProjectFactoryEvent"("bindingId", "createdAt");
CREATE INDEX "CloudProjectFactoryEvent_operationId_idx" ON "CloudProjectFactoryEvent"("operationId");

CREATE TABLE "CloudOperation" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "kind" "CloudOperationKind" NOT NULL,
  "status" "CloudOperationStatus" NOT NULL DEFAULT 'PENDING',
  "tenantId" TEXT,
  "relatedTenantId" TEXT,
  "bindingId" TEXT,
  "actorUserId" TEXT,
  "reauthenticatedAt" TIMESTAMP(3),
  "step" TEXT NOT NULL DEFAULT 'REQUESTED',
  "payload" JSONB NOT NULL,
  "checkpoint" JSONB,
  "result" JSONB,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "fence" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CloudOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CloudOperation_fence_check" CHECK ("fence" >= 0 AND "version" >= 0 AND "attempts" >= 0),
  CONSTRAINT "CloudOperation_lease_pair_check" CHECK (("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL))
);
CREATE UNIQUE INDEX "CloudOperation_idempotencyKey_key" ON "CloudOperation"("idempotencyKey");
CREATE INDEX "CloudOperation_status_nextAttemptAt_idx" ON "CloudOperation"("status", "nextAttemptAt");
CREATE INDEX "CloudOperation_tenantId_createdAt_idx" ON "CloudOperation"("tenantId", "createdAt");
CREATE INDEX "CloudOperation_relatedTenantId_createdAt_idx" ON "CloudOperation"("relatedTenantId", "createdAt");
CREATE INDEX "CloudOperation_bindingId_createdAt_idx" ON "CloudOperation"("bindingId", "createdAt");

CREATE TABLE "CloudOperationEvent" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "fence" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CloudOperationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CloudOperationEvent_operationId_createdAt_idx" ON "CloudOperationEvent"("operationId", "createdAt");

CREATE TABLE "CloudTenantTransfer" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "cloudTenantId" TEXT NOT NULL,
  "expectedOwnershipVersion" INTEGER NOT NULL,
  "fromPrincipalId" TEXT NOT NULL,
  "toPrincipalId" TEXT NOT NULL,
  "grantRoles" JSONB NOT NULL,
  "state" "CloudTenantTransferState" NOT NULL DEFAULT 'REQUESTED',
  "revokeEvidence" JSONB,
  "revokeVerifiedAt" TIMESTAMP(3),
  "regrantEvidence" JSONB,
  "version" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CloudTenantTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CloudTenantTransfer_version_check" CHECK ("version" >= 0 AND "expectedOwnershipVersion" > 0),
  CONSTRAINT "CloudTenantTransfer_regrant_guard" CHECK (
    "state" NOT IN ('REGRANTING', 'COMPLETED') OR "revokeVerifiedAt" IS NOT NULL
  )
);
CREATE UNIQUE INDEX "CloudTenantTransfer_operationId_key" ON "CloudTenantTransfer"("operationId");
CREATE INDEX "CloudTenantTransfer_cloudTenantId_createdAt_idx" ON "CloudTenantTransfer"("cloudTenantId", "createdAt");
CREATE INDEX "CloudTenantTransfer_state_idx" ON "CloudTenantTransfer"("state");

CREATE TABLE "CloudTeardownRecord" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "requestOperationId" TEXT NOT NULL,
  "status" "CloudTeardownStatus" NOT NULL DEFAULT 'INVENTORYING',
  "resourceInventory" JSONB,
  "erasureProof" JSONB,
  "orphans" JSONB,
  "version" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CloudTeardownRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CloudTeardownRecord_version_check" CHECK ("version" >= 0)
);
CREATE UNIQUE INDEX "CloudTeardownRecord_requestOperationId_key" ON "CloudTeardownRecord"("requestOperationId");
CREATE INDEX "CloudTeardownRecord_bindingId_startedAt_idx" ON "CloudTeardownRecord"("bindingId", "startedAt");

CREATE TABLE "PlatformIamIdentity" (
  "id" TEXT NOT NULL,
  "bindingId" TEXT,
  "kind" "PlatformIamIdentityKind" NOT NULL,
  "app" TEXT NOT NULL DEFAULT '',
  "environment" TEXT NOT NULL DEFAULT '',
  "privilegeBoundary" TEXT NOT NULL,
  "gcpProjectId" TEXT NOT NULL,
  "gcpServiceAccountEmail" TEXT NOT NULL,
  "persistentKeys" INTEGER NOT NULL DEFAULT 0,
  "complianceStatus" "PlatformIamComplianceStatus" NOT NULL DEFAULT 'UNKNOWN',
  "revisionsServed" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "lastRotatedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformIamIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformIamIdentity_counts_check" CHECK ("persistentKeys" >= 0 AND "revisionsServed" >= 0 AND "version" >= 0),
  CONSTRAINT "PlatformIamIdentity_boundary_check" CHECK (
    ("kind" = 'RUNTIME' AND length("app") > 0 AND length("environment") > 0)
    OR ("kind" <> 'RUNTIME' AND "app" = '' AND "environment" = '')
  )
);
CREATE UNIQUE INDEX "PlatformIamIdentity_gcpServiceAccountEmail_key" ON "PlatformIamIdentity"("gcpServiceAccountEmail");
CREATE UNIQUE INDEX "PlatformIamIdentity_boundary_key"
  ON "PlatformIamIdentity"("kind", "app", "environment", "privilegeBoundary", "gcpProjectId");
CREATE INDEX "PlatformIamIdentity_gcpProjectId_kind_idx" ON "PlatformIamIdentity"("gcpProjectId", "kind");
CREATE INDEX "PlatformIamIdentity_bindingId_idx" ON "PlatformIamIdentity"("bindingId");

CREATE TABLE "PlatformIamImpersonationAudit" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "actorPrincipal" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "tokenLifetimeSeconds" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformIamImpersonationAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformIamImpersonationAudit_lifetime_check" CHECK ("tokenLifetimeSeconds" BETWEEN 1 AND 3600)
);
CREATE INDEX "PlatformIamImpersonationAudit_identityId_createdAt_idx" ON "PlatformIamImpersonationAudit"("identityId", "createdAt");

ALTER TABLE "CloudTenant" ADD CONSTRAINT "CloudTenant_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudTenant" ADD CONSTRAINT "CloudTenant_mergedIntoTenantId_fkey"
  FOREIGN KEY ("mergedIntoTenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudTenant" ADD CONSTRAINT "CloudTenant_splitFromTenantId_fkey"
  FOREIGN KEY ("splitFromTenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudProjectBinding" ADD CONSTRAINT "CloudProjectBinding_cloudTenantId_fkey"
  FOREIGN KEY ("cloudTenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudProjectBinding" ADD CONSTRAINT "CloudProjectBinding_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudProjectFactoryEvent" ADD CONSTRAINT "CloudProjectFactoryEvent_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "CloudProjectBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudProjectFactoryEvent" ADD CONSTRAINT "CloudProjectFactoryEvent_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "CloudOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudOperation" ADD CONSTRAINT "CloudOperation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudOperation" ADD CONSTRAINT "CloudOperation_relatedTenantId_fkey"
  FOREIGN KEY ("relatedTenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudOperation" ADD CONSTRAINT "CloudOperation_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "CloudProjectBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudOperation" ADD CONSTRAINT "CloudOperation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CloudOperationEvent" ADD CONSTRAINT "CloudOperationEvent_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "CloudOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudTenantTransfer" ADD CONSTRAINT "CloudTenantTransfer_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "CloudOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudTenantTransfer" ADD CONSTRAINT "CloudTenantTransfer_cloudTenantId_fkey"
  FOREIGN KEY ("cloudTenantId") REFERENCES "CloudTenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudTeardownRecord" ADD CONSTRAINT "CloudTeardownRecord_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "CloudProjectBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CloudTeardownRecord" ADD CONSTRAINT "CloudTeardownRecord_requestOperationId_fkey"
  FOREIGN KEY ("requestOperationId") REFERENCES "CloudOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIamIdentity" ADD CONSTRAINT "PlatformIamIdentity_bindingId_fkey"
  FOREIGN KEY ("bindingId") REFERENCES "CloudProjectBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformIamImpersonationAudit" ADD CONSTRAINT "PlatformIamImpersonationAudit_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "PlatformIamIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
