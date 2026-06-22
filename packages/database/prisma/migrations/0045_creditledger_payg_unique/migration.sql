-- Atomic dedup for PAYG_CHARGE ledger rows (bug-sweep #7).
--
-- recordPaygCharge deduped with a non-atomic find-then-create and no backing
-- constraint, so two concurrent settlements of the same checkpoint could both
-- insert a PAYG_CHARGE row, inflating sumPaygSpendSince (false budget-cap trips +
-- duplicate spend alerts). Add a partial unique index so the DB enforces "at most
-- one PAYG_CHARGE per (organizationId, checkpointId)"; the code now inserts and
-- catches P2002.
--
-- Self-healing + safe to run on prod regardless of existing data: credits are
-- currently shadow/dormant so this table is expected to hold ZERO PAYG_CHARGE rows
-- (the DELETE then affects 0 rows), but if any duplicates already existed the
-- defensive DELETE removes them first (keeping the earliest per key) so the unique
-- index can be created without error. Additive + idempotent.

-- (a) Remove any pre-existing duplicate PAYG_CHARGE rows, keeping the earliest
--     (oldest createdAt, id as a stable tie-break) per (organizationId, checkpointId).
DELETE FROM "CreditLedger" a
USING "CreditLedger" b
WHERE a."kind" = 'PAYG_CHARGE'
  AND b."kind" = 'PAYG_CHARGE'
  AND a."organizationId" = b."organizationId"
  AND a."checkpointId" = b."checkpointId"
  AND a."checkpointId" IS NOT NULL
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- (b) Partial unique index — scoped to PAYG_CHARGE so it never constrains
--     CONSUMPTION/GRANT/etc. rows (which legitimately share null/other checkpointIds).
CREATE UNIQUE INDEX IF NOT EXISTS "CreditLedger_org_checkpoint_payg_key"
  ON "CreditLedger" ("organizationId", "checkpointId")
  WHERE "kind" = 'PAYG_CHARGE' AND "checkpointId" IS NOT NULL;
