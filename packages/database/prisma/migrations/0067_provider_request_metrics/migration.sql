-- F18 — per-request AI provider outcome metric (2026-07-12): lets the admin
-- Providers panel show a REAL p95 latency + 24h error rate per provider instead of
-- metricsAvailable:false. Written best-effort (non-blocking) on BOTH success and
-- failure from the chat completion path.
--
-- ADDITIVE ONLY: creates one NEW table + its indexes. No ALTER/DROP/RENAME on any
-- existing object, no data backfill — zero impact on existing rows/tables, and a new
-- empty table takes no lock on live traffic.
CREATE TABLE "ProviderRequestMetric" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "errored" BOOLEAN NOT NULL DEFAULT false,
    "statusCode" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderRequestMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderRequestMetric_provider_createdAt_idx" ON "ProviderRequestMetric"("provider", "createdAt");
CREATE INDEX "ProviderRequestMetric_createdAt_idx" ON "ProviderRequestMetric"("createdAt");
