-- Prevent project ownership changes while a manager reserve request can still arrive.
ALTER TABLE "Workspace" ADD COLUMN "runtimeAdmissionRequests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
