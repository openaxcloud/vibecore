-- AUDX-018: reserve credits BEFORE the provider call.
--
-- Metering debits only when usage is REPORTED — after the money is already
-- spent. A report that never arrives is free AI, and N concurrent calls each
-- clear the same pre-check, so the wallet can be driven past its balance.
--
-- `heldCents` makes available = balanceCents - heldCents, and the hold is taken
-- with a CONDITIONAL update so the check and the hold are one atomic statement.
ALTER TABLE "CreditWallet" ADD COLUMN "heldCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CreditReservation" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId"      TEXT,
  "conversationId" TEXT,
  "amountCents"    INTEGER NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'HELD',
  "settledCents"   INTEGER,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditReservation_organizationId_status_idx" ON "CreditReservation" ("organizationId", "status");
CREATE INDEX "CreditReservation_status_expiresAt_idx" ON "CreditReservation" ("status", "expiresAt");
