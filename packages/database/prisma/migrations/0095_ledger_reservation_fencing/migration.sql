-- Canonical reservation fencing and replay integrity.
--
-- `version` serializes commit/release/revive/reaper transitions across API
-- replicas. `requestHash` makes an idempotency-key replay fail closed when the
-- business request differs. The partial unique index prevents two canonical
-- holds from being attached to the same import job while preserving historical
-- non-import reservations and NULL values.

ALTER TABLE "LedgerReservation"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "requestHash" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "LedgerReservation"
    WHERE "importJobId" IS NOT NULL
      AND "operation" = 'import'
    GROUP BY "importJobId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'LEDGER_IMPORT_RESERVATION_DUPLICATES';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "LedgerReservation_import_job_unique"
  ON "LedgerReservation" ("importJobId")
  WHERE "importJobId" IS NOT NULL AND "operation" = 'import';
