-- P0 deterministic rollback after Deployment/AdminAuditLog pruning.
-- Nullable is intentional for rolling compatibility; readers reject legacy
-- server-image manifests explicitly instead of substituting mutable defaults.
ALTER TABLE "ReleaseManifest"
  ADD COLUMN "runtimeSpec" JSONB,
  ADD COLUMN "promotionEvidence" JSONB;

