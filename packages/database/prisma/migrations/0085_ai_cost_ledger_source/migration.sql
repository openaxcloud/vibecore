-- AUDX-017: mark where AI token counts came from.
--
-- /ai/record-usage is a session-authenticated HTTP route, so its token counts
-- are DECLARED by the caller: anyone holding a user session could post
-- inputTokens: 0 and bill nothing. Rows reported server-to-server (internal
-- shared secret) are 'trusted'; session-reported rows stay 'declared' so they
-- are reconcilable instead of silently believed.
--
-- Existing rows backfill to 'declared' on purpose: that is the honest
-- description of how every one of them was produced.
ALTER TABLE "AiCostLedger" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'declared';

CREATE INDEX "AiCostLedger_organizationId_source_createdAt_idx"
  ON "AiCostLedger" ("organizationId", "source", "createdAt");
