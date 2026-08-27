-- Add optional French marketplace copy without rewriting or dropping existing English data.
-- Empty arrays/objects represent "translation unavailable" and are resolved through the
-- English fallback in the API until a localized value is supplied.
ALTER TABLE "McpCatalogEntry"
  ADD COLUMN "nameFr" TEXT,
  ADD COLUMN "descriptionFr" TEXT,
  ADD COLUMN "tagsFr" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "configSchemaFr" JSONB NOT NULL DEFAULT '{}'::JSONB;
