-- Migration: Integrations panel — connector catalog, user-scoped connections,
-- per-project links, enterprise OAuth app overrides, per-org connector policies,
-- reconnection alerts and user-submitted integration feature requests. Adds a
-- featuredForIdePanel column to McpCatalogEntry so the new IDE Integrations
-- panel can surface a curated subset of the existing MCP marketplace catalog.

-- McpCatalogEntry: surface MCP entries in the new IDE Integrations panel
ALTER TABLE "McpCatalogEntry" ADD COLUMN "featuredForIdePanel" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX "McpCatalogEntry_featuredForIdePanel_idx" ON "McpCatalogEntry" ("featuredForIdePanel");

-- ConnectorCatalog: provider metadata, default OAuth credentials (encrypted),
-- API-key field definitions, trigger metadata, webhook signing secret, plan
-- gating, section assignment and IDE-panel visibility.
CREATE TABLE "ConnectorCatalog" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "authType" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "logoUrl" TEXT NOT NULL,
  "defaultClientId" TEXT,
  "defaultClientSecretEnc" TEXT,
  "authorizeUrl" TEXT,
  "tokenUrl" TEXT,
  "revokeUrl" TEXT,
  "userInfoUrl" TEXT,
  "defaultScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "availableScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "apiKeyFields" JSONB,
  "apiKeyTestEndpoint" TEXT,
  "triggersSupported" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "triggerDescriptions" JSONB NOT NULL DEFAULT '{}',
  "webhookSupport" BOOLEAN NOT NULL DEFAULT FALSE,
  "webhookSignatureScheme" TEXT,
  "webhookSigningSecretEnc" TEXT,
  "minPlanTier" TEXT NOT NULL DEFAULT 'free',
  "forAgentUse" BOOLEAN NOT NULL DEFAULT TRUE,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "featuredForIdePanel" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorCatalog_authType_check" CHECK ("authType" IN ('oauth', 'api_key')),
  CONSTRAINT "ConnectorCatalog_section_check" CHECK ("section" IN ('connectors', 'git_providers', 'managed')),
  CONSTRAINT "ConnectorCatalog_minPlanTier_check" CHECK ("minPlanTier" IN ('free', 'pro', 'enterprise'))
);

CREATE UNIQUE INDEX "ConnectorCatalog_provider_key" ON "ConnectorCatalog" ("provider");
CREATE INDEX "ConnectorCatalog_section_enabled_idx" ON "ConnectorCatalog" ("section", "enabled");
CREATE INDEX "ConnectorCatalog_category_idx" ON "ConnectorCatalog" ("category");

-- OrganizationOAuthAppOverride: Enterprise feature letting an org plug in
-- their own OAuth client credentials for a given provider. Listed first
-- because UserConnection references it.
CREATE TABLE "OrganizationOAuthAppOverride" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientSecretEncrypted" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "configuredByUserId" TEXT NOT NULL,
  "testedAt" TIMESTAMP(3),
  "testStatus" TEXT,
  "testError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationOAuthAppOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationOAuthAppOverride_configuredByUserId_fkey" FOREIGN KEY ("configuredByUserId") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrganizationOAuthAppOverride_organizationId_provider_key" ON "OrganizationOAuthAppOverride" ("organizationId", "provider");

-- UserConnection: per-user OAuth or API-key account linked to an external
-- provider. accessTokenEncrypted / refreshTokenEncrypted store reversible
-- AES-256-GCM ciphertext via packages/security; this is distinct from
-- OAuthConnection which stores hashed tokens for login only.
CREATE TABLE "UserConnection" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "externalAccountLabel" TEXT NOT NULL,
  "accessTokenEncrypted" TEXT,
  "refreshTokenEncrypted" TEXT,
  "apiKeyFieldsEncrypted" JSONB,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tokenExpiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastUsedAt" TIMESTAMP(3),
  "forAgentUse" BOOLEAN NOT NULL DEFAULT TRUE,
  "oauthAppSource" TEXT NOT NULL DEFAULT 'e_code_default',
  "oauthAppOverrideId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "UserConnection_status_check" CHECK ("status" IN ('active', 'needs_reconnect', 'revoked')),
  CONSTRAINT "UserConnection_oauthAppSource_check" CHECK ("oauthAppSource" IN ('e_code_default', 'org_override')),
  CONSTRAINT "UserConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserConnection_oauthAppOverrideId_fkey" FOREIGN KEY ("oauthAppOverrideId") REFERENCES "OrganizationOAuthAppOverride" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserConnection_userId_provider_externalAccountId_key" ON "UserConnection" ("userId", "provider", "externalAccountId");
CREATE INDEX "UserConnection_userId_provider_idx" ON "UserConnection" ("userId", "provider");
CREATE INDEX "UserConnection_status_idx" ON "UserConnection" ("status");

-- ProjectConnectionLink: a project opts in to use a UserConnection. The
-- sidecar proxy ACL verifies this link before forwarding any call.
CREATE TABLE "ProjectConnectionLink" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "userConnectionId" TEXT NOT NULL,
  "linkedByUserId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unlinkedAt" TIMESTAMP(3),
  CONSTRAINT "ProjectConnectionLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectConnectionLink_userConnectionId_fkey" FOREIGN KEY ("userConnectionId") REFERENCES "UserConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectConnectionLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectConnectionLink_projectId_userConnectionId_key" ON "ProjectConnectionLink" ("projectId", "userConnectionId");
CREATE INDEX "ProjectConnectionLink_projectId_idx" ON "ProjectConnectionLink" ("projectId");
CREATE INDEX "ProjectConnectionLink_userConnectionId_idx" ON "ProjectConnectionLink" ("userConnectionId");

-- OrganizationConnectorPolicy: Enterprise per-org enable/disable + role ACL
-- on top of the default catalog. allowedRoleKeys matches Role.key and
-- CustomRole.key (no Groups table exists in e-code today).
CREATE TABLE "OrganizationConnectorPolicy" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowedRoleKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rateLimitOverride" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationConnectorPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationConnectorPolicy_rateLimitOverride_check" CHECK ("rateLimitOverride" IS NULL OR "rateLimitOverride" > 0)
);

CREATE UNIQUE INDEX "OrganizationConnectorPolicy_organizationId_provider_key" ON "OrganizationConnectorPolicy" ("organizationId", "provider");

-- ReconnectionAlert: persistent alert raised when the sidecar receives a 401
-- or 403 from a provider, or when the health-check worker detects a revoked
-- token. The chat surfaces an unresolved alert as a banner.
CREATE TABLE "ReconnectionAlert" (
  "id" TEXT PRIMARY KEY,
  "userConnectionId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  CONSTRAINT "ReconnectionAlert_userConnectionId_fkey" FOREIGN KEY ("userConnectionId") REFERENCES "UserConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReconnectionAlert_reason_check" CHECK ("reason" IN ('token_expired', 'token_revoked', 'scope_insufficient'))
);

CREATE INDEX "ReconnectionAlert_userConnectionId_resolvedAt_idx" ON "ReconnectionAlert" ("userConnectionId", "resolvedAt");

-- IntegrationFeatureRequest: user-submitted "Request an integration" entries
-- shown in the platform admin page for triage.
CREATE TABLE "IntegrationFeatureRequest" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "integrationName" TEXT NOT NULL,
  "useCaseDescription" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationFeatureRequest_status_check" CHECK ("status" IN ('pending', 'reviewed', 'approved', 'declined')),
  CONSTRAINT "IntegrationFeatureRequest_integrationName_check" CHECK (char_length("integrationName") BETWEEN 1 AND 200),
  CONSTRAINT "IntegrationFeatureRequest_useCaseDescription_check" CHECK (char_length("useCaseDescription") BETWEEN 1 AND 1000),
  CONSTRAINT "IntegrationFeatureRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IntegrationFeatureRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "IntegrationFeatureRequest_status_idx" ON "IntegrationFeatureRequest" ("status");
CREATE INDEX "IntegrationFeatureRequest_userId_idx" ON "IntegrationFeatureRequest" ("userId");
