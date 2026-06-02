-- Scoped API keys: back the /api/keys store with the metadata the UI needs.
-- `keyPrefix` stores the non-secret leading characters of the token so the
-- list view can show "vck_abcd…" without ever persisting the full secret
-- (only its SHA-256 hash in `keyHash` is stored). `lastUsedAt` is stamped
-- when a key authenticates a request so users can spot stale credentials.
-- Both nullable: existing rows (none in practice) keep working.

ALTER TABLE "ApiKey" ADD COLUMN "keyPrefix" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");
