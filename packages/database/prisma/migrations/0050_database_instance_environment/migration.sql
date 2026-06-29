-- P2d dev/prod split (2026-06-29): a project can have a `development` and a
-- `production` DatabaseInstance. Existing rows backfill to 'development', and
-- the per-project uniqueness becomes (projectId, environment). Additive: the
-- production path is dormant until publish provisions it.
ALTER TABLE "DatabaseInstance" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'development';
DROP INDEX IF EXISTS "DatabaseInstance_projectId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DatabaseInstance_projectId_environment_key" ON "DatabaseInstance"("projectId", "environment");
