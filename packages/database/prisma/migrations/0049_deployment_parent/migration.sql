-- P2d dev/prod split (2026-06-29): a production deployment published from a
-- preview/staging deployment links back to its source. Additive + nullable;
-- existing deployments are unaffected.
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "parentDeploymentId" TEXT;
