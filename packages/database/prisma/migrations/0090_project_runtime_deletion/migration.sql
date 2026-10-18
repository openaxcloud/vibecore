-- Fence restoration and runtime admission throughout permanent resource teardown.
ALTER TABLE "Project" ADD COLUMN "runtimeDeletionPending" BOOLEAN NOT NULL DEFAULT false;
