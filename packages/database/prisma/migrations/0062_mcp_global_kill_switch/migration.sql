-- MCP global admin controls. ADDITIVE ONLY — one new nullable-safe column with a
-- default on "McpCatalogEntry", plus a brand-new "McpGlobalPolicy" table. No
-- ALTER on column types, no DROP/RENAME, nothing destructive. Every existing
-- McpCatalogEntry row gets enabled=true (unchanged behaviour). Fully reversible:
-- DROP COLUMN "McpCatalogEntry"."enabled" and DROP TABLE "McpGlobalPolicy".

-- AlterTable: global kill-switch flag (defaults true so all existing rows stay live)
ALTER TABLE "McpCatalogEntry" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "McpCatalogEntry_enabled_idx" ON "McpCatalogEntry"("enabled");

-- CreateTable: platform-wide MCP policy (one tier above the per-org policy)
CREATE TABLE "McpGlobalPolicy" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpGlobalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpGlobalPolicy_slug_key" ON "McpGlobalPolicy"("slug");

-- CreateIndex
CREATE INDEX "McpGlobalPolicy_mode_idx" ON "McpGlobalPolicy"("mode");
