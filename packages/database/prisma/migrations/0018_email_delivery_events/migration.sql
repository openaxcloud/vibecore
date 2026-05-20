-- Captures delivery / bounce / complaint events sent back from transactional
-- email providers (Resend today; SendGrid / SES later — `provider` lets us
-- tell them apart). The (provider, providerEventId) unique gives us free
-- idempotency: re-deliveries from the provider's retry queue become no-ops
-- instead of duplicating rows.
--
-- `email` is the recipient address as-reported by the provider. We don't FK
-- to User because verification + password-reset emails are sent BEFORE the
-- account exists, and bounces for those still need to be observable.

CREATE TABLE "EmailDeliveryEvent" (
  "id"              TEXT PRIMARY KEY,
  "provider"        TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "email"           TEXT NOT NULL,
  "emailMessageId"  TEXT,
  "subject"         TEXT,
  "fromAddress"     TEXT,
  "payload"         JSONB NOT NULL,
  "receivedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "EmailDeliveryEvent_provider_providerEventId_key"
  ON "EmailDeliveryEvent" ("provider", "providerEventId");
CREATE INDEX "EmailDeliveryEvent_email_idx"          ON "EmailDeliveryEvent" ("email");
CREATE INDEX "EmailDeliveryEvent_type_idx"           ON "EmailDeliveryEvent" ("type");
CREATE INDEX "EmailDeliveryEvent_emailMessageId_idx" ON "EmailDeliveryEvent" ("emailMessageId");
