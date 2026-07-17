-- D4 phase 1 — billing minimal de sûreté.
-- UsageReservation: idempotent credit HOLD (ceiling); the real debit happens
--   exactly once at COMMIT, after the billable step, via CreditLedger entries
--   stamped with reservationId. Release/compensation on cancel/timeout/failure.
-- PaymentAuthorization: money-side (PSP) authorization for purchases (domains),
--   deliberately a DIFFERENT object from the credit hold.
-- CreditLedger.reservationId: explicit importJobId <-> reservationId <-> ledger
--   correlation.
-- UsageEvent becomes APPEND-ONLY at the DATABASE level (trigger): corrections
--   happen via compensating CreditLedger entries, never by mutating history.
-- Idempotent for parallel-branch re-entrancy (same convention as 0074).

DO $$ BEGIN
  CREATE TYPE "UsageReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'COMPENSATED', 'RELEASED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentAuthorizationStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UsageReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "maxAmountCents" INTEGER NOT NULL,
    "committedCents" INTEGER,
    "status" "UsageReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "rateCardVersion" INTEGER,
    "importJobId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageReservation_pkey" PRIMARY KEY ("id")
);

-- The idempotency backbone: one reservation per (org, key), enforced by the DB.
CREATE UNIQUE INDEX IF NOT EXISTS "UsageReservation_organizationId_idempotencyKey_key"
    ON "UsageReservation"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "UsageReservation_organizationId_status_idx"
    ON "UsageReservation"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "UsageReservation_status_expiresAt_idx"
    ON "UsageReservation"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "UsageReservation_importJobId_idx"
    ON "UsageReservation"("importJobId");

CREATE TABLE IF NOT EXISTS "PaymentAuthorization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PaymentAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAuthorization_organizationId_idempotencyKey_key"
    ON "PaymentAuthorization"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "PaymentAuthorization_organizationId_status_idx"
    ON "PaymentAuthorization"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "PaymentAuthorization_status_expiresAt_idx"
    ON "PaymentAuthorization"("status", "expiresAt");

-- Correlation column on the credit ledger.
ALTER TABLE "CreditLedger" ADD COLUMN IF NOT EXISTS "reservationId" TEXT;
CREATE INDEX IF NOT EXISTS "CreditLedger_reservationId_idx" ON "CreditLedger"("reservationId");

-- UsageEvent is append-only: any UPDATE or DELETE is refused by the database
-- itself. Corrections are compensating CreditLedger entries, never mutations.
CREATE OR REPLACE FUNCTION usage_event_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'UsageEvent is append-only: % refused. Correct with a compensating CreditLedger entry, never by mutating history.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS usage_event_immutable ON "UsageEvent";
CREATE TRIGGER usage_event_immutable
BEFORE UPDATE OR DELETE ON "UsageEvent"
FOR EACH ROW EXECUTE FUNCTION usage_event_block_mutation();
