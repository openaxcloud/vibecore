-- Replit-parity P3b: credit packs, Service Shutdown Limit, Agent build-tier/Turbo.
-- Additive + dormant (BILLING_CREDITS_ENABLED gates all use). See docs/REPLIT_PARITY_SPEC.md.

ALTER TABLE "CreditWallet" ADD COLUMN IF NOT EXISTS "serviceShutdownCents" INTEGER;

ALTER TABLE "AgentCheckpoint" ADD COLUMN IF NOT EXISTS "buildTier" TEXT NOT NULL DEFAULT 'power';
ALTER TABLE "AgentCheckpoint" ADD COLUMN IF NOT EXISTS "turboMode" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "CreditPack" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchasedCents" INTEGER NOT NULL,
  "remainingCents" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stripePaymentIntentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditPack_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CreditPack_organizationId_expiresAt_idx" ON "CreditPack" ("organizationId", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "CreditPack" ADD CONSTRAINT "CreditPack_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
