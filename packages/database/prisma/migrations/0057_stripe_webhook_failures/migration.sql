-- Failed Stripe webhook processing attempts (2026-07-03). Stores the full
-- event payload so /admin/stripe can replay the exact event through the same
-- processing path; resolvedAt marks a successful replay (or Stripe retry).
CREATE TABLE IF NOT EXISTS "StripeWebhookFailure" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "StripeWebhookFailure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookFailure_eventId_key" ON "StripeWebhookFailure"("eventId");

CREATE INDEX IF NOT EXISTS "StripeWebhookFailure_resolvedAt_failedAt_idx" ON "StripeWebhookFailure"("resolvedAt", "failedAt");
