-- P2 triage (2026-06-19): additional missing indexes behind reporting/sweep
-- queries that previously full-scanned. Additive only — CREATE INDEX IF NOT
-- EXISTS, no data change.

-- Per-user usage reporting filters UsageEvent by userId over time.
CREATE INDEX IF NOT EXISTS "UsageEvent_userId_createdAt_idx" ON "UsageEvent" ("userId", "createdAt");

-- Org-scoped credit-expiry sweep filters organizationId + kind + expiresAt.
CREATE INDEX IF NOT EXISTS "CreditLedger_organizationId_kind_expiresAt_idx" ON "CreditLedger" ("organizationId", "kind", "expiresAt");

-- "restores requested by user" lookups over DatabaseRestore.
CREATE INDEX IF NOT EXISTS "DatabaseRestore_requestedByUserId_idx" ON "DatabaseRestore" ("requestedByUserId");
