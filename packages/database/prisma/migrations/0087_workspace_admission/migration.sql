-- Expand-only: historical runtimes remain explicitly legacy (NULL).
ALTER TABLE "WorkspaceRuntime"
  ADD COLUMN "admissionGeneration" TEXT,
  ADD COLUMN "admissionState" TEXT,
  ADD COLUMN "admissionReservedAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceRuntime" ADD CONSTRAINT "WorkspaceRuntime_admission_coherent"
CHECK (
  ("admissionGeneration" IS NULL AND "admissionState" IS NULL AND "admissionReservedAt" IS NULL)
  OR (
    "admissionGeneration" IS NOT NULL AND "admissionReservedAt" IS NOT NULL
    AND "admissionState" IS NOT NULL
    AND "admissionState" IN ('RESERVED', 'PROVISIONING', 'ACTIVE', 'STOPPING', 'RELEASED')
  )
);
