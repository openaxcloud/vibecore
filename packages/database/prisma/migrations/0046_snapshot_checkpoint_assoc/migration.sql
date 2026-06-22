-- Snapshot↔checkpoint association (2026-06-22): the IDE "Rollback here" feature
-- previously paired assistant message N to projectSnapshots[N-1] by ordinal
-- index. That assumed exactly one snapshot per assistant turn, but the AI tool
-- path creates one "before-ai-change" snapshot per *mutating tool call*
-- (delete_file/rename_file/apply_patch/restore_snapshot), so a single agent turn
-- produces MANY snapshots. The ordinal index therefore pointed at an unrelated
-- snapshot → "Rollback here" silently restored the wrong project state.
--
-- We now persist the real association that IS knowable at snapshot-creation time
-- (which happens per tool call, before the assistant message completes):
--   * conversationId — the AI conversation the tool call belongs to.
--   * turnIndex      — the assistant-turn ordinal within that conversation
--                      (count of assistant messages already persisted when the
--                      snapshot was taken). The FIRST snapshot of a turn shares
--                      the smallest createdAt; the client pairs each checkpoint to
--                      the earliest snapshot of its turn group.
--
-- Both columns are nullable and additive: pre-existing snapshots stay NULL and
-- the client degrades to a clearly-labelled best-effort (never a silently-wrong
-- restore). No backfill is required — historical snapshots simply lack the
-- association and fall through to the legacy heuristic.

ALTER TABLE "ProjectSnapshot" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
ALTER TABLE "ProjectSnapshot" ADD COLUMN IF NOT EXISTS "turnIndex" INTEGER;

-- Client pairing groups a project's snapshots by (conversationId, turnIndex);
-- this composite index keeps that lookup off a full table scan.
CREATE INDEX IF NOT EXISTS "ProjectSnapshot_conversationId_turnIndex_idx"
  ON "ProjectSnapshot" ("conversationId", "turnIndex");
