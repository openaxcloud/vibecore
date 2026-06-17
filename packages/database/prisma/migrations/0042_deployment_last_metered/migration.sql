-- Replit-parity deploy metering: per-deployment last-metered marker so a
-- deployment's compute is metered exactly once when it reaches READY and a
-- re-reconcile (every GET polls status) never double-charges. Mirrors
-- WorkspaceRuntime.lastMeteredAt. Additive + nullable + DORMANT until
-- BILLING_CREDITS_ENABLED. See services/api/src/metering-service.ts.

ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "lastMeteredAt" TIMESTAMP(3);
