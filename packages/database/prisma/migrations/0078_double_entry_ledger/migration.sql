-- 0078_double_entry_ledger — canonical double-entry ledger (C1 / P0-V3-12)
-- Tables generated via 'prisma migrate diff'; immutability triggers appended by hand
-- (house style, cf 0010 pgvector / 0076 usage_event trigger).

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "LedgerEntryDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'COMPENSATED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LedgerReconciliationStatus" AS ENUM ('OK', 'DISCREPANCY');

-- DropForeignKey
ALTER TABLE "OrganizationOAuthAppOverride" DROP CONSTRAINT "OrganizationOAuthAppOverride_configuredByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectConnectionLink" DROP CONSTRAINT "ProjectConnectionLink_linkedByUserId_fkey";

-- DropIndex
DROP INDEX "AgentMemory_active_idx";

-- DropIndex
DROP INDEX "AgentMemory_embedding_hnsw";

-- DropIndex
DROP INDEX "AgentMemory_tags_idx";

-- AlterTable
ALTER TABLE "AgentMemory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AgentMemoryPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AgentPatchProposal" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ConnectorCatalog" ALTER COLUMN "defaultScopes" DROP DEFAULT,
ALTER COLUMN "availableScopes" DROP DEFAULT,
ALTER COLUMN "triggersSupported" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ImportJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LoginProviderConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "McpCatalogEntry" ALTER COLUMN "tags" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "McpInstall" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrganizationConnectorPolicy" ALTER COLUMN "allowedRoleKeys" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrganizationOAuthAppOverride" ALTER COLUMN "scopes" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectSecret" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectSkill" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RemixJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SiemWebhook" ALTER COLUMN "secretCiphertext" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StripeConfig" ALTER COLUMN "id" SET DEFAULT 'singleton',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UserConnection" ALTER COLUMN "scopes" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkspaceRuntime" ALTER COLUMN "updatedAt" DROP DEFAULT;

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
ALTER TABLE "ProjectConnectionLink" ADD CONSTRAINT "ProjectConnectionLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationOAuthAppOverride" ADD CONSTRAINT "OrganizationOAuthAppOverride_configuredByUserId_fkey" FOREIGN KEY ("configuredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "AgentMemory_org_idx" RENAME TO "AgentMemory_organizationId_updatedAt_idx";

-- RenameIndex
ALTER INDEX "AgentMemory_project_idx" RENAME TO "AgentMemory_projectId_updatedAt_idx";

-- RenameIndex
ALTER INDEX "AgentMemory_session_idx" RENAME TO "AgentMemory_sessionId_updatedAt_idx";

-- RenameIndex
ALTER INDEX "AgentMemory_user_scope_idx" RENAME TO "AgentMemory_userId_scope_updatedAt_idx";

-- RenameIndex
ALTER INDEX "AgentMemoryPreference_organization_updated_idx" RENAME TO "AgentMemoryPreference_organizationId_updatedAt_idx";

-- RenameIndex
ALTER INDEX "AgentMemoryPreference_project_updated_idx" RENAME TO "AgentMemoryPreference_projectId_updatedAt_idx";

-- RenameIndex
ALTER INDEX "AgentMemoryPreference_user_updated_idx" RENAME TO "AgentMemoryPreference_userId_updatedAt_idx";


-- ─────────────────────────────────────────────────────────────────────────────
-- IMMUTABILITY (I-LED-3): a posted ledger transaction and its entries are
-- append-only. Any UPDATE / DELETE / TRUNCATE is refused by the database itself.
-- A correction is a NEW reversing transaction, never a mutation of history.
-- Covers the row-level UPDATE/DELETE AND the statement-level TRUNCATE (the latter
-- bypasses FOR EACH ROW triggers).
-- ─────────────────────────────────────────────────────────────────────────────
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
