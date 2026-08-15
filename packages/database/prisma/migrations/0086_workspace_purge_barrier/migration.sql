-- RR-CODEX-14 (P3): durable workspace purge barrier on WorkspaceRuntime.
ALTER TABLE "WorkspaceRuntime" ADD COLUMN "purgeFrozen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkspaceRuntime" ADD COLUMN "purgeFenceToken" TEXT;
