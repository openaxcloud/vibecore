-- Reserved VM: durable, fenced create/change saga and persistent runtime state.
-- No cloud resources are created by this migration.

ALTER TABLE "Deployment"
  ADD COLUMN "runtimeKind" TEXT NOT NULL DEFAULT 'autoscale',
  ADD COLUMN "runtimeVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reservedVmTier" TEXT,
  ADD COLUMN "reservedVmPriceCents" INTEGER,
  ADD COLUMN "reservedVmTermsVersion" TEXT,
  ADD COLUMN "reservedVmRateCardVersion" INTEGER,
  ADD COLUMN "reservedVmBillingReservationId" TEXT,
  ADD COLUMN "reservedVmBillingState" TEXT,
  ADD COLUMN "reservedVmCurrentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "reservedVmNextChargeAt" TIMESTAMP(3),
  ADD COLUMN "reservedVmGraceEndsAt" TIMESTAMP(3),
  ADD COLUMN "reservedVmStopRequestedAt" TIMESTAMP(3),
  ADD COLUMN "persistentStorageClaim" TEXT;

ALTER TABLE "Deployment"
  ADD CONSTRAINT "Deployment_runtimeKind_check"
    CHECK ("runtimeKind" IN ('autoscale', 'reserved-vm')),
  ADD CONSTRAINT "Deployment_runtimeVersion_check"
    CHECK ("runtimeVersion" >= 0),
  ADD CONSTRAINT "Deployment_reservedVmTier_check"
    CHECK ("reservedVmTier" IS NULL OR "reservedVmTier" IN ('shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4')),
  ADD CONSTRAINT "Deployment_reservedVmPriceCents_check"
    CHECK ("reservedVmPriceCents" IS NULL OR "reservedVmPriceCents" IN (2000, 4000, 8000, 16000)),
  ADD CONSTRAINT "Deployment_reservedVmRateCardVersion_check"
    CHECK ("reservedVmRateCardVersion" IS NULL OR "reservedVmRateCardVersion" > 0),
  ADD CONSTRAINT "Deployment_reservedVmBillingState_check"
    CHECK ("reservedVmBillingState" IS NULL OR "reservedVmBillingState" IN ('CURRENT', 'PAST_DUE', 'STOP_REQUIRED')),
  ADD CONSTRAINT "Deployment_reservedVmBillingWindow_check"
    CHECK (
      "reservedVmCurrentPeriodStart" IS NULL
      OR "reservedVmNextChargeAt" IS NULL
      OR "reservedVmNextChargeAt" > "reservedVmCurrentPeriodStart"
    ),
  ADD CONSTRAINT "Deployment_reservedVmBillingState_shape_check"
    CHECK (
      "reservedVmBillingState" IS NULL
      OR (
        "reservedVmBillingState" = 'CURRENT'
        AND "reservedVmCurrentPeriodStart" IS NOT NULL
        AND "reservedVmNextChargeAt" IS NOT NULL
      )
      OR (
        "reservedVmBillingState" = 'PAST_DUE'
        AND "reservedVmCurrentPeriodStart" IS NOT NULL
        AND "reservedVmNextChargeAt" IS NOT NULL
        AND "reservedVmGraceEndsAt" IS NOT NULL
      )
      OR (
        "reservedVmBillingState" = 'STOP_REQUIRED'
        AND "reservedVmCurrentPeriodStart" IS NOT NULL
        AND "reservedVmNextChargeAt" IS NOT NULL
        AND "reservedVmGraceEndsAt" IS NOT NULL
        AND "reservedVmStopRequestedAt" IS NOT NULL
      )
    );

CREATE UNIQUE INDEX "Deployment_reservedVmBillingReservationId_key"
  ON "Deployment"("reservedVmBillingReservationId");

CREATE TABLE "ReservedVmOperation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "phase" TEXT NOT NULL DEFAULT 'RESERVED',
  "fromRuntimeKind" TEXT,
  "fromTier" TEXT,
  "targetRuntimeKind" TEXT NOT NULL,
  "targetTier" TEXT,
  "targetMachineSize" TEXT NOT NULL,
  "targetPriceCents" INTEGER NOT NULL,
  "billingAmountCents" INTEGER NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "rateCardVersion" INTEGER NOT NULL,
  "expectedRuntimeVersion" INTEGER NOT NULL,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "fencingToken" INTEGER NOT NULL DEFAULT 0,
  "billingReservationId" TEXT,
  "response" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservedVmOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReservedVmOperation_kind_check" CHECK ("kind" IN ('CREATE', 'CHANGE')),
  CONSTRAINT "ReservedVmOperation_status_check" CHECK ("status" IN ('PENDING', 'APPLYING', 'COMPLETED', 'FAILED')),
  CONSTRAINT "ReservedVmOperation_phase_check" CHECK ("phase" IN ('RESERVED', 'LEASED', 'RUNTIME_APPLIED', 'COMMITTED', 'ROLLED_BACK')),
  CONSTRAINT "ReservedVmOperation_fromRuntimeKind_check" CHECK ("fromRuntimeKind" IS NULL OR "fromRuntimeKind" IN ('autoscale', 'reserved-vm')),
  CONSTRAINT "ReservedVmOperation_targetRuntimeKind_check" CHECK ("targetRuntimeKind" IN ('autoscale', 'reserved-vm')),
  CONSTRAINT "ReservedVmOperation_targetTier_check" CHECK ("targetTier" IS NULL OR "targetTier" IN ('shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4')),
  CONSTRAINT "ReservedVmOperation_price_check" CHECK ("targetPriceCents" IN (0, 2000, 4000, 8000, 16000)),
  CONSTRAINT "ReservedVmOperation_billingAmount_check" CHECK ("billingAmountCents" >= 0 AND "billingAmountCents" <= 16000),
  CONSTRAINT "ReservedVmOperation_rateCardVersion_check" CHECK ("rateCardVersion" > 0),
  CONSTRAINT "ReservedVmOperation_runtime_shape_check" CHECK (
    ("targetRuntimeKind" = 'autoscale' AND "targetTier" IS NULL AND "targetPriceCents" = 0)
    OR
    ("targetRuntimeKind" = 'reserved-vm' AND "targetTier" IS NOT NULL AND "targetPriceCents" > 0)
  ),
  CONSTRAINT "ReservedVmOperation_fencingToken_check" CHECK ("fencingToken" >= 0),
  CONSTRAINT "ReservedVmOperation_expectedRuntimeVersion_check" CHECK ("expectedRuntimeVersion" >= 0),
  CONSTRAINT "ReservedVmOperation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservedVmOperation_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservedVmOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReservedVmOperation_billingReservationId_fkey" FOREIGN KEY ("billingReservationId") REFERENCES "LedgerReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReservedVmOperation_projectId_idempotencyKey_key"
  ON "ReservedVmOperation"("projectId", "idempotencyKey");
CREATE UNIQUE INDEX "ReservedVmOperation_billingReservationId_key"
  ON "ReservedVmOperation"("billingReservationId");
CREATE INDEX "ReservedVmOperation_deploymentId_createdAt_idx"
  ON "ReservedVmOperation"("deploymentId", "createdAt");
CREATE INDEX "ReservedVmOperation_status_leaseExpiresAt_idx"
  ON "ReservedVmOperation"("status", "leaseExpiresAt");

CREATE TABLE "ReservedVmBillingPeriod" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "tier" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "rateCardVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DUE',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "reservationGeneration" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "fencingToken" INTEGER NOT NULL DEFAULT 0,
  "billingReservationId" TEXT,
  "graceEndsAt" TIMESTAMP(3),
  "stopRequestedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservedVmBillingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReservedVmBillingPeriod_tier_check" CHECK ("tier" IN ('shared-0.5', 'dedicated-1', 'dedicated-2', 'dedicated-4')),
  CONSTRAINT "ReservedVmBillingPeriod_price_check" CHECK ("priceCents" IN (2000, 4000, 8000, 16000)),
  CONSTRAINT "ReservedVmBillingPeriod_status_check" CHECK ("status" IN ('DUE', 'PROCESSING', 'PAID', 'PAST_DUE', 'STOP_REQUIRED', 'CANCELED')),
  CONSTRAINT "ReservedVmBillingPeriod_window_check" CHECK ("periodEnd" > "periodStart"),
  CONSTRAINT "ReservedVmBillingPeriod_rateCardVersion_check" CHECK ("rateCardVersion" > 0),
  CONSTRAINT "ReservedVmBillingPeriod_attemptCount_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "ReservedVmBillingPeriod_reservationGeneration_check" CHECK ("reservationGeneration" >= 0),
  CONSTRAINT "ReservedVmBillingPeriod_fencingToken_check" CHECK ("fencingToken" >= 0),
  CONSTRAINT "ReservedVmBillingPeriod_state_shape_check" CHECK (
    "status" = 'DUE'
    OR (
      "status" = 'PROCESSING'
      AND "billingReservationId" IS NOT NULL
      AND "leaseOwner" IS NOT NULL
      AND "leaseExpiresAt" IS NOT NULL
    )
    OR (
      "status" = 'PAID'
      AND "billingReservationId" IS NOT NULL
      AND "settledAt" IS NOT NULL
      AND "leaseOwner" IS NULL
      AND "leaseExpiresAt" IS NULL
    )
    OR (
      "status" = 'PAST_DUE'
      AND "billingReservationId" IS NOT NULL
      AND "graceEndsAt" IS NOT NULL
      AND "leaseOwner" IS NULL
      AND "leaseExpiresAt" IS NULL
    )
    OR (
      "status" = 'STOP_REQUIRED'
      AND "graceEndsAt" IS NOT NULL
      AND "stopRequestedAt" IS NOT NULL
      AND "leaseOwner" IS NULL
      AND "leaseExpiresAt" IS NULL
    )
    OR "status" = 'CANCELED'
  ),
  CONSTRAINT "ReservedVmBillingPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservedVmBillingPeriod_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservedVmBillingPeriod_billingReservationId_fkey" FOREIGN KEY ("billingReservationId") REFERENCES "LedgerReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReservedVmBillingPeriod_deploymentId_periodStart_key"
  ON "ReservedVmBillingPeriod"("deploymentId", "periodStart");
CREATE UNIQUE INDEX "ReservedVmBillingPeriod_billingReservationId_key"
  ON "ReservedVmBillingPeriod"("billingReservationId");
CREATE INDEX "ReservedVmBillingPeriod_status_leaseExpiresAt_idx"
  ON "ReservedVmBillingPeriod"("status", "leaseExpiresAt");
CREATE INDEX "ReservedVmBillingPeriod_organizationId_status_idx"
  ON "ReservedVmBillingPeriod"("organizationId", "status");
CREATE INDEX "ReservedVmBillingPeriod_deploymentId_status_idx"
  ON "ReservedVmBillingPeriod"("deploymentId", "status");
