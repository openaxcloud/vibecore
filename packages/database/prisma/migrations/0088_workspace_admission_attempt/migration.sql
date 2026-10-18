-- Fence individual starts/restarts/stops within the same quota reservation.
ALTER TABLE "WorkspaceRuntime" ADD COLUMN "admissionAttemptId" TEXT;
ALTER TABLE "WorkspaceRuntime" ADD CONSTRAINT "WorkspaceRuntime_admission_attempt_coherent"
CHECK ("admissionAttemptId" IS NULL OR "admissionGeneration" IS NOT NULL);
