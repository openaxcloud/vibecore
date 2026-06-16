-- Replit-parity billing foundation: credit wallet, effort-based checkpoints, and
-- the admin-owned provider/model registry. All additive and dormant until the
-- BILLING_CREDITS_ENABLED / MODEL_REGISTRY_DB flags are turned on, so existing
-- flat-rate Stripe billing is unaffected. See docs/REPLIT_PARITY_SPEC.md.

-- Plan: annual price + per-plan monthly credit grant + interval-specific price IDs.
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "annualCents" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "includedCreditCents" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "stripePriceMonthlyId" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "stripePriceAnnualId" TEXT;

-- Enums.
DO $$ BEGIN
  CREATE TYPE "CreditEntryKind" AS ENUM ('GRANT', 'CONSUMPTION', 'PAYG_CHARGE', 'REFUND', 'ADJUSTMENT', 'EXPIRY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CheckpointStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreditWallet: one USD-cent balance per organization.
CREATE TABLE IF NOT EXISTS "CreditWallet" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "balanceCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "budgetCapCents" INTEGER,
  "autoTopupCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditWallet_organizationId_key" ON "CreditWallet" ("organizationId");

-- CreditLedger: append-only credit movements.
CREATE TABLE IF NOT EXISTS "CreditLedger" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "deltaCents" INTEGER NOT NULL,
  "kind" "CreditEntryKind" NOT NULL,
  "reason" TEXT NOT NULL,
  "checkpointId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CreditLedger_organizationId_createdAt_idx" ON "CreditLedger" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditLedger_walletId_createdAt_idx" ON "CreditLedger" ("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditLedger_checkpointId_idx" ON "CreditLedger" ("checkpointId");
CREATE INDEX IF NOT EXISTS "CreditLedger_kind_expiresAt_idx" ON "CreditLedger" ("kind", "expiresAt");

-- AgentCheckpoint: one effort-based checkpoint per agent request.
CREATE TABLE IF NOT EXISTS "AgentCheckpoint" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "projectId" TEXT,
  "conversationId" TEXT,
  "runId" TEXT,
  "status" "CheckpointStatus" NOT NULL DEFAULT 'PENDING',
  "highPowerModel" BOOLEAN NOT NULL DEFAULT false,
  "extendedThinking" BOOLEAN NOT NULL DEFAULT false,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "wallMs" INTEGER NOT NULL DEFAULT 0,
  "computeCents" INTEGER NOT NULL DEFAULT 0,
  "rawProviderCents" INTEGER NOT NULL DEFAULT 0,
  "creditCents" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AgentCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentCheckpoint_organizationId_startedAt_idx" ON "AgentCheckpoint" ("organizationId", "startedAt");
CREATE INDEX IF NOT EXISTS "AgentCheckpoint_projectId_idx" ON "AgentCheckpoint" ("projectId");
CREATE INDEX IF NOT EXISTS "AgentCheckpoint_runId_idx" ON "AgentCheckpoint" ("runId");

-- ProviderConfig: admin-owned AI provider registry.
CREATE TABLE IF NOT EXISTS "ProviderConfig" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "apiKeySecret" TEXT,
  "baseUrl" TEXT,
  "byokAllowed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConfig_provider_key" ON "ProviderConfig" ("provider");

-- ModelConfig: admin-owned model registry.
CREATE TABLE IF NOT EXISTS "ModelConfig" (
  "id" TEXT NOT NULL,
  "providerConfigId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "enabledPlans" JSONB NOT NULL,
  "isHighPower" BOOLEAN NOT NULL DEFAULT false,
  "supportsThinking" BOOLEAN NOT NULL DEFAULT false,
  "inputCentsPerM" INTEGER NOT NULL,
  "outputCentsPerM" INTEGER NOT NULL,
  "contextWindow" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ModelConfig_providerConfigId_modelId_key" ON "ModelConfig" ("providerConfigId", "modelId");
CREATE INDEX IF NOT EXISTS "ModelConfig_enabled_idx" ON "ModelConfig" ("enabled");

-- Foreign keys.
DO $$ BEGIN
  ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "CreditWallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentCheckpoint" ADD CONSTRAINT "AgentCheckpoint_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ModelConfig" ADD CONSTRAINT "ModelConfig_providerConfigId_fkey"
    FOREIGN KEY ("providerConfigId") REFERENCES "ProviderConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
