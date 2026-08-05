-- RR-CODEX-12: live-lease heartbeat state + per-user singleton for PurgePlan.

-- Durable reclaim state: ACTIVE (owner holds) | RECLAIMING (reconciler claimed).
ALTER TABLE "PurgePlan" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- Per-user singleton: at most ONE plan per subject (replaces the non-unique index).
DROP INDEX "PurgePlan_userId_idx";
CREATE UNIQUE INDEX "PurgePlan_userId_key" ON "PurgePlan"("userId");
