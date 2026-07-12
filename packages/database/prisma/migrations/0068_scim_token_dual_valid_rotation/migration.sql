-- F16 — SCIM token 24h dual-valid rotation (2026-07-12): on rotate, the old hash
-- moves to previousTokenHash and rotatedAt is stamped; the previous token keeps
-- authenticating until rotatedAt + 24h so an IdP can roll the bearer over with no
-- provisioning downtime.
--
-- ADDITIVE ONLY: two NULLable columns + one index. No ALTER TYPE / DROP / RENAME on
-- any existing object, no backfill — existing rows keep previousTokenHash = NULL
-- (no previous token, so no dual-valid window, identical to today's behaviour).
ALTER TABLE "ScimToken" ADD COLUMN "previousTokenHash" TEXT;
ALTER TABLE "ScimToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);

CREATE INDEX "ScimToken_previousTokenHash_idx" ON "ScimToken"("previousTokenHash");
