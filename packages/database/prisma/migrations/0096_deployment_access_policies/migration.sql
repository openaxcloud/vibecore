-- P102/P103/P104 — versioned deployment access policies and one-shot private
-- origin exchange tickets. Existing releases were explicitly public before
-- this feature, so migration records that fact as policy v1. Any missing or
-- mismatched pointer after this migration is treated INVITE_ONLY by the edge.

CREATE TABLE "DeploymentAccessPolicy" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "passwordHash" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeploymentAccessPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeploymentAccessPolicy_version_check" CHECK ("version" > 0),
  CONSTRAINT "DeploymentAccessPolicy_mode_check" CHECK (
    "mode" IN ('PUBLIC', 'PASSWORD_PROTECTED', 'WORKSPACE_ONLY', 'INVITE_ONLY')
  ),
  CONSTRAINT "DeploymentAccessPolicy_password_shape_check" CHECK (
    ("mode" = 'PASSWORD_PROTECTED' AND "passwordHash" IS NOT NULL AND length("passwordHash") > 0)
    OR ("mode" <> 'PASSWORD_PROTECTED' AND "passwordHash" IS NULL)
  ),
  CONSTRAINT "DeploymentAccessPolicy_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeploymentAccessPolicy_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeploymentAccessPolicy_project_environment_version_key"
  ON "DeploymentAccessPolicy"("projectId", "environment", "version");
CREATE UNIQUE INDEX "DeploymentAccessPolicy_revision_key"
  ON "DeploymentAccessPolicy"("revision");
CREATE INDEX "DeploymentAccessPolicy_project_environment_createdAt_idx"
  ON "DeploymentAccessPolicy"("projectId", "environment", "createdAt");

-- Adding with a default preserves rolling compatibility with an older API pod.
-- The new edge still resolves the exact policy row and fails closed if an old
-- pod creates a row for a brand-new project before policy v1 exists.
ALTER TABLE "Deployment"
  ADD COLUMN "accessPolicyVersion" INTEGER NOT NULL DEFAULT 1;

-- ReleaseManifest is append-only (0092 trigger), so adding the column with its
-- legacy-public value is the only backfill that does not mutate immutable rows.
ALTER TABLE "ReleaseManifest"
  ADD COLUMN "accessPolicyVersion" INTEGER NOT NULL DEFAULT 1;

-- Every project/environment with a pre-existing deployment or release gets one
-- explicit immutable PUBLIC policy. This is compatibility data, not a fail-open
-- fallback: a pointer without this exact row remains denied.
INSERT INTO "DeploymentAccessPolicy" (
  "id", "projectId", "environment", "version", "mode", "revision", "passwordHash"
)
SELECT
  'dap_legacy_' || md5(scope."projectId" || chr(31) || scope."environment"),
  scope."projectId",
  scope."environment",
  1,
  'PUBLIC',
  'legacy-public-v1-' || md5(scope."projectId" || chr(31) || scope."environment"),
  NULL
FROM (
  SELECT DISTINCT "projectId", COALESCE("environmentName", 'preview') AS "environment"
  FROM "Deployment"
  UNION
  SELECT DISTINCT "projectId", COALESCE("environment", 'preview') AS "environment"
  FROM "ReleaseManifest"
) AS scope
ON CONFLICT ("projectId", "environment", "version") DO NOTHING;

CREATE TABLE "DeploymentAccessExchangeTicket" (
  "id" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "policyRevision" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeploymentAccessExchangeTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeploymentAccessExchangeTicket_policy_version_check" CHECK ("policyVersion" > 0),
  CONSTRAINT "DeploymentAccessExchangeTicket_expiry_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "DeploymentAccessExchangeTicket_deploymentId_fkey"
    FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DeploymentAccessExchangeTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeploymentAccessExchangeTicket_tokenHash_key"
  ON "DeploymentAccessExchangeTicket"("tokenHash");
CREATE INDEX "DeploymentAccessExchangeTicket_deployment_expiry_idx"
  ON "DeploymentAccessExchangeTicket"("deploymentId", "expiresAt");
CREATE INDEX "DeploymentAccessExchangeTicket_user_expiry_idx"
  ON "DeploymentAccessExchangeTicket"("userId", "expiresAt");

-- Access policies are immutable while their project exists. A project hard
-- delete remains the sole deletion path and cascades policies cleanly.
CREATE FUNCTION "deploymentAccessPolicyRejectMutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Preserve semantic immutability while allowing PostgreSQL to apply the
    -- FK redaction caused by deleting the policy author. A caller cannot
    -- perform this redaction directly while the User row still exists, and
    -- no other field may change in the same statement.
    IF OLD."createdByUserId" IS NOT NULL
       AND NEW."createdByUserId" IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM "User" WHERE "id" = OLD."createdByUserId"
       )
       AND NEW."id" IS NOT DISTINCT FROM OLD."id"
       AND NEW."projectId" IS NOT DISTINCT FROM OLD."projectId"
       AND NEW."environment" IS NOT DISTINCT FROM OLD."environment"
       AND NEW."version" IS NOT DISTINCT FROM OLD."version"
       AND NEW."mode" IS NOT DISTINCT FROM OLD."mode"
       AND NEW."revision" IS NOT DISTINCT FROM OLD."revision"
       AND NEW."passwordHash" IS NOT DISTINCT FROM OLD."passwordHash"
       AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'DeploymentAccessPolicy is append-only';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Project" WHERE "id" = OLD."projectId"
  ) THEN
    RAISE EXCEPTION 'DeploymentAccessPolicy is append-only';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "DeploymentAccessPolicy_append_only"
BEFORE UPDATE OR DELETE ON "DeploymentAccessPolicy"
FOR EACH ROW
EXECUTE FUNCTION "deploymentAccessPolicyRejectMutation"();
