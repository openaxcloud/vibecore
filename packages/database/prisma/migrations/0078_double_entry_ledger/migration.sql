-- 0078_double_entry_ledger — canonical double-entry ledger (C1 / P0-V3-12)
-- NETTOYEE le 21/07 avant merge : la version issue de prisma migrate diff
-- embarquait des artefacts de derive de schema etrangers au ledger
-- (suppressions d'index memoire agent, 2 cles etrangeres, 18 alterations) ;
-- retires. Cette migration est PUREMENT ADDITIVE : enums + tables Ledger*
-- + index + cles internes + triggers d'immutabilite.

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "LedgerEntryDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'COMPENSATED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LedgerReconciliationStatus" AS ENUM ('OK', 'DISCREPANCY');

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reversalOfId" TEXT,
    "rateCardVersion" INTEGER,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "LedgerEntryDirection" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "LedgerReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "maxAmountMinor" BIGINT NOT NULL,
    "committedMinor" BIGINT,
    "rateCardVersion" INTEGER,
    "importJobId" TEXT,
    "reserveTxId" TEXT,
    "settleTxId" TEXT,
    "compensateTxId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerFxRate" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rateNum" BIGINT NOT NULL,
    "rateDen" BIGINT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "cutoffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerFxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerReconciliationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "source" TEXT NOT NULL,
    "status" "LedgerReconciliationStatus" NOT NULL,
    "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "discrepancies" JSONB,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "LedgerReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerAccount_organizationId_idx" ON "LedgerAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_organizationId_key_currency_key" ON "LedgerAccount"("organizationId", "key", "currency");

-- CreateIndex
CREATE INDEX "LedgerTransaction_organizationId_postedAt_idx" ON "LedgerTransaction"("organizationId", "postedAt");

-- CreateIndex
CREATE INDEX "LedgerTransaction_reversalOfId_idx" ON "LedgerTransaction"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_organizationId_idempotencyKey_key" ON "LedgerTransaction"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_currency_idx" ON "LedgerEntry"("accountId", "currency");

-- CreateIndex
CREATE INDEX "LedgerReservation_organizationId_status_idx" ON "LedgerReservation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LedgerReservation_status_expiresAt_idx" ON "LedgerReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "LedgerReservation_importJobId_idx" ON "LedgerReservation"("importJobId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerReservation_organizationId_idempotencyKey_key" ON "LedgerReservation"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerFxRate_fromCurrency_toCurrency_effectiveAt_idx" ON "LedgerFxRate"("fromCurrency", "toCurrency", "effectiveAt");

-- CreateIndex
CREATE INDEX "LedgerReconciliationRun_source_runAt_idx" ON "LedgerReconciliationRun"("source", "runAt");

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION ledger_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Ledger % is append-only: % refused. Correct with a reversing transaction, never by mutating a posted event.', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_transaction_immutable ON "LedgerTransaction";
CREATE TRIGGER ledger_transaction_immutable
  BEFORE UPDATE OR DELETE ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION ledger_block_mutation();

DROP TRIGGER IF EXISTS ledger_transaction_no_truncate ON "LedgerTransaction";
CREATE TRIGGER ledger_transaction_no_truncate
  BEFORE TRUNCATE ON "LedgerTransaction"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_block_mutation();

DROP TRIGGER IF EXISTS ledger_entry_immutable ON "LedgerEntry";
CREATE TRIGGER ledger_entry_immutable
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_block_mutation();

DROP TRIGGER IF EXISTS ledger_entry_no_truncate ON "LedgerEntry";
CREATE TRIGGER ledger_entry_no_truncate
  BEFORE TRUNCATE ON "LedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_block_mutation();

