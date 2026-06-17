-- Replit-parity P4 metering emitter: per-runtime last-metered marker so the
-- workspace-manager GC meters active compute idempotently (window from the marker
-- to lastActiveAt on stop, then advance). Additive + nullable.

ALTER TABLE "WorkspaceRuntime" ADD COLUMN IF NOT EXISTS "lastMeteredAt" TIMESTAMP(3);
