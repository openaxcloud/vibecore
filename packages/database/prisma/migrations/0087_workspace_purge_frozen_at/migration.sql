-- RR-CODEX-14 v5 (R-P3-04): timestamp for orphaned-barrier recovery by age.
ALTER TABLE "WorkspaceRuntime" ADD COLUMN "purgeFrozenAt" TIMESTAMP(3);
