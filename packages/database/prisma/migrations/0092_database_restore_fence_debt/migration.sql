-- A takeover must retain every predecessor whose exclusion is unconfirmed.
-- Debt is removed only after a fenced acknowledgement by the current owner.
ALTER TABLE "DatabaseRestoreExecution"
ADD COLUMN "pendingFenceTokens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
