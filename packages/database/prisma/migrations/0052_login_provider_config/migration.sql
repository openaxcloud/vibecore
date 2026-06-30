-- Admin-managed social-login provider config (2026-06-30): a platform admin can
-- paste each sign-in provider's (GitHub / Google) OAuth client_id + client_secret
-- in /admin/oauth-providers instead of editing the platform Secret + redeploying.
-- One row per provider (provider = PK). The secret is stored encrypted
-- (encryptJson) and is write-only. The login flow reads this row DB-first and
-- falls back to the *_CLIENT_ID/*_CLIENT_SECRET env vars, so an absent row keeps
-- current env-based behaviour with zero regression.
CREATE TABLE IF NOT EXISTS "LoginProviderConfig" (
    "provider" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSecretEnc" TEXT,
    "scopes" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginProviderConfig_pkey" PRIMARY KEY ("provider")
);
