-- Optimistic-lock generation on LedgerReservation (expert V3 §C).
-- Serializes the revive / reaper-expire / attach sequence: every lifecycle
-- transition bumps `version`, and each compare-and-set pins the version it
-- read, so a concurrent transition invalidates the others (fail-closed).
-- Additive + idempotent (parallel-branch re-entrancy, convention 0074+).

ALTER TABLE "LedgerReservation" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
