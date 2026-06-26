-- Admin-managed Stripe config (2026-06-26): a platform admin can paste the live
-- Stripe secret key + webhook signing secret in /admin/stripe instead of editing
-- values-prod.yaml + redeploying. Singleton row (id = 'singleton'). Both secrets
-- are stored encrypted (encryptJson) and are write-only. Billing reads this row
-- DB-first and falls back to env, so an empty/absent row is a no-op (current
-- env-based behaviour is unchanged until an admin saves a value).
CREATE TABLE IF NOT EXISTS "StripeConfig" (
    "id" TEXT NOT NULL,
    "secretKeyEnc" TEXT,
    "webhookSecretEnc" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeConfig_pkey" PRIMARY KEY ("id")
);
