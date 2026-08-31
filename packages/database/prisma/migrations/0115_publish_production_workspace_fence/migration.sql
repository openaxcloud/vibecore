-- A production publish owns exactly one durable editable checkout. Historical
-- races may have created more than one row; retain their files and identity as
-- explicit legacy checkouts instead of deleting user data, then enforce the
-- live production slot at the provider authority boundary.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "projectId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS ordinal
  FROM "Workspace"
  WHERE "environment" = 'production'
)
UPDATE "Workspace" workspace
SET "environment" = 'production-legacy:' || workspace."id"
FROM ranked
WHERE workspace."id" = ranked."id"
  AND ranked.ordinal > 1;

CREATE UNIQUE INDEX "Workspace_one_production_per_project_key"
  ON "Workspace" ("projectId")
  WHERE "environment" = 'production';
