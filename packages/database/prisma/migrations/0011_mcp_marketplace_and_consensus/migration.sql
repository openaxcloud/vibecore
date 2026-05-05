-- Migration: MCP marketplace + parallel-subagents persistence + consensus records
-- Adds catalog of MCP servers typed by domain, per-user installs, and persisted
-- agent runs with consensus result records.

CREATE TYPE "McpDomain" AS ENUM (
  'AI_AGENTS',
  'CODE_EXECUTION',
  'DATABASES',
  'DEVOPS',
  'DEVELOPER_TOOLS',
  'COMMUNICATION',
  'PRODUCTIVITY',
  'KNOWLEDGE',
  'WEB_BROWSING',
  'SEARCH',
  'CLOUD',
  'SECURITY',
  'FILESYSTEM',
  'VERSION_CONTROL',
  'MONITORING',
  'OTHER'
);

CREATE TYPE "McpTransport" AS ENUM ('STDIO', 'SSE', 'STREAMABLE_HTTP');

CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED');

CREATE TYPE "AgentRunResultStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'FAILED');

CREATE TYPE "ConsensusAlgorithm" AS ENUM ('QUORUM', 'BYZANTINE_PBFT', 'WEIGHTED_PLURALITY');

CREATE TYPE "ConsensusOutcome" AS ENUM ('ACCEPTED', 'REJECTED', 'PARTIAL', 'ABSTAINED');

CREATE TABLE "McpCatalogEntry" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "domain" "McpDomain" NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "author" TEXT NOT NULL,
  "homepageUrl" TEXT,
  "iconUrl" TEXT,
  "version" TEXT NOT NULL,
  "transport" "McpTransport" NOT NULL,
  "configTemplate" JSONB NOT NULL,
  "configSchema" JSONB NOT NULL DEFAULT '{}',
  "installCount" INTEGER NOT NULL DEFAULT 0,
  "featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpCatalogEntry_install_count_check" CHECK ("installCount" >= 0)
);

CREATE UNIQUE INDEX "McpCatalogEntry_slug_key" ON "McpCatalogEntry" ("slug");
CREATE INDEX "McpCatalogEntry_domain_idx" ON "McpCatalogEntry" ("domain");
CREATE INDEX "McpCatalogEntry_featured_verified_idx" ON "McpCatalogEntry" ("featured", "verified");

CREATE TABLE "McpInstall" (
  "id" TEXT PRIMARY KEY,
  "catalogEntryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "alias" TEXT NOT NULL,
  "configJson" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpInstall_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "McpCatalogEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpInstall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpInstall_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpInstall_alias_check" CHECK (char_length("alias") BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX "McpInstall_userId_alias_key" ON "McpInstall" ("userId", "alias");
CREATE INDEX "McpInstall_organizationId_idx" ON "McpInstall" ("organizationId");
CREATE INDEX "McpInstall_catalogEntryId_idx" ON "McpInstall" ("catalogEntryId");

CREATE TABLE "AgentRun" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "userId" TEXT,
  "conversationId" TEXT,
  "projectId" TEXT,
  "mode" TEXT NOT NULL,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "rolesPlanned" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AgentRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AgentRun_organizationId_startedAt_idx" ON "AgentRun" ("organizationId", "startedAt");
CREATE INDEX "AgentRun_userId_startedAt_idx" ON "AgentRun" ("userId", "startedAt");
CREATE INDEX "AgentRun_conversationId_idx" ON "AgentRun" ("conversationId");

CREATE TABLE "AgentRunResult" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "status" "AgentRunResultStatus" NOT NULL,
  "summary" TEXT NOT NULL,
  "files" JSONB NOT NULL DEFAULT '[]',
  "risks" JSONB NOT NULL DEFAULT '[]',
  "verification" JSONB NOT NULL DEFAULT '[]',
  "rawOutput" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AgentRunResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentRunResult_runId_roleId_key" ON "AgentRunResult" ("runId", "roleId");
CREATE INDEX "AgentRunResult_runId_idx" ON "AgentRunResult" ("runId");

CREATE TABLE "ConsensusRecord" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "algorithm" "ConsensusAlgorithm" NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "outcome" "ConsensusOutcome" NOT NULL,
  "agreementScore" DOUBLE PRECISION NOT NULL,
  "claimVotes" JSONB NOT NULL,
  "conflicts" JSONB NOT NULL DEFAULT '[]',
  "consolidated" JSONB NOT NULL,
  "rounds" INTEGER NOT NULL DEFAULT 1,
  "durationMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsensusRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsensusRecord_threshold_check" CHECK ("threshold" >= 0 AND "threshold" <= 1),
  CONSTRAINT "ConsensusRecord_agreement_check" CHECK ("agreementScore" >= 0 AND "agreementScore" <= 1),
  CONSTRAINT "ConsensusRecord_rounds_check" CHECK ("rounds" >= 1),
  CONSTRAINT "ConsensusRecord_duration_check" CHECK ("durationMs" >= 0)
);

CREATE UNIQUE INDEX "ConsensusRecord_runId_key" ON "ConsensusRecord" ("runId");
