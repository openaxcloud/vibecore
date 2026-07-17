-- Agent modes + routing: versioned Agent Routing Card + per-call agent log.
--
-- 1. AgentRoutingCard: versioned document mapping modes (Lite/Economy/Power)
--    and switches (High effort/Turbo) + the harness classifier to concrete
--    provider models, with cost-of-revenue and user pricing. A config change
--    inserts a NEW version (effectiveFrom/effectiveTo/sourceDate) — never a
--    deployment. Seeded with version 1, transcribed from
--    packages/billing/src/agent-routing.ts BUILTIN_AGENT_ROUTING_CARD.
-- 2. AgentCallLog: one row per routed agent LLM call (admin-only): mode,
--    switches, escalation, REAL provider+model, tokens, cost (millicents),
--    credits billed and margin.
--
-- Idempotent (IF NOT EXISTS) so parallel-branch merges stay re-entrant.

CREATE TABLE IF NOT EXISTS "AgentRoutingCard" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "sourceDate" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRoutingCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentRoutingCard_version_key" ON "AgentRoutingCard"("version");
CREATE INDEX IF NOT EXISTS "AgentRoutingCard_active_idx" ON "AgentRoutingCard"("active");

DO $$ BEGIN
    ALTER TABLE "AgentRoutingCard"
        ADD CONSTRAINT "AgentRoutingCard_createdByUserId_fkey"
        FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AgentCallLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "organizationId" TEXT,
    "projectId" TEXT,
    "mode" TEXT NOT NULL,
    "highEffort" BOOLEAN NOT NULL DEFAULT false,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "turbo" BOOLEAN NOT NULL DEFAULT false,
    "lineKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costMillicents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "marginMillicents" INTEGER NOT NULL DEFAULT 0,
    "billedToUser" BOOLEAN NOT NULL DEFAULT true,
    "routingCardVersion" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'chat',

    CONSTRAINT "AgentCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentCallLog_createdAt_idx" ON "AgentCallLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AgentCallLog_lineKey_createdAt_idx" ON "AgentCallLog"("lineKey", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentCallLog_organizationId_createdAt_idx" ON "AgentCallLog"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentCallLog_projectId_createdAt_idx" ON "AgentCallLog"("projectId", "createdAt");
