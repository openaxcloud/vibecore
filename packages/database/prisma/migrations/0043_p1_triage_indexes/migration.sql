-- P1 triage (2026-06-19): add missing indexes behind hot background sweeps that
-- previously full-scanned. Additive only — CREATE INDEX IF NOT EXISTS, no data
-- change, safe to apply online on these small/medium tables.

-- Presence/session cleanup sweeps WorkspaceSession by userId (nullable).
CREATE INDEX IF NOT EXISTS "WorkspaceSession_userId_idx" ON "WorkspaceSession" ("userId");

-- Background connection-token health sweep keysets on lastHealthCheckAt.
CREATE INDEX IF NOT EXISTS "UserConnection_lastHealthCheckAt_idx" ON "UserConnection" ("lastHealthCheckAt");

-- "linked by" lookups + user-offboarding scans of ProjectConnectionLink.
CREATE INDEX IF NOT EXISTS "ProjectConnectionLink_linkedByUserId_idx" ON "ProjectConnectionLink" ("linkedByUserId");
