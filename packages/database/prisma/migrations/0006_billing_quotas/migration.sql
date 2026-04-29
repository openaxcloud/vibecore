ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_provider_externalId_key" UNIQUE ("provider", "externalId");

ALTER TABLE "Subscription"
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Subscription_externalId_key" ON "Subscription"("externalId");

ALTER TABLE "Plan"
  ADD COLUMN "stripeProductId" TEXT,
  ADD COLUMN "stripePriceId" TEXT;

ALTER TABLE "QuotaLedger"
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE TABLE "QuotaOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotaOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuotaOverride_organizationId_key_idx" ON "QuotaOverride"("organizationId", "key");
ALTER TABLE "QuotaOverride" ADD CONSTRAINT "QuotaOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StripeEvent_organizationId_idx" ON "StripeEvent"("organizationId");
CREATE INDEX "StripeEvent_type_idx" ON "StripeEvent"("type");
ALTER TABLE "StripeEvent" ADD CONSTRAINT "StripeEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
