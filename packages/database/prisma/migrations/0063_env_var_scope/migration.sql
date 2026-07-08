-- F11: per-scope (development / preview / production) project environment variables.
--
-- Additive migration: a "scope" column is added with a DEFAULT of 'production' so
-- every pre-existing row keeps working unchanged (it is interpreted as a
-- production-scoped value). No column is dropped or renamed.
--
-- The uniqueness guarantee is widened from (projectId, key) to
-- (projectId, key, scope) so the SAME key can hold a different value per scope
-- (e.g. DATABASE_URL in development vs production). Existing rows remain unique
-- because they all collapse to scope = 'production'.

ALTER TABLE "ProjectEnvVar" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'production';

DROP INDEX "ProjectEnvVar_projectId_key_key";

CREATE UNIQUE INDEX "ProjectEnvVar_projectId_key_scope_key" ON "ProjectEnvVar"("projectId", "key", "scope");
