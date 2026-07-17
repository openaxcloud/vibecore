-- Deploy machine sizes + versioned Rate Card.
--
-- 1. Deployment.machineSize: the rate-card size key picked at publish, applied
--    verbatim as the runtime pod's requests==limits and used to price compute.
-- 2. RateCard: versioned priced catalogue; a price change inserts a NEW version
--    (history is never mutated). Seeded with version 1, transcribed from
--    packages/billing/src/rate-card.ts BUILTIN_RATE_CARD.

ALTER TABLE "Deployment" ADD COLUMN "machineSize" TEXT NOT NULL DEFAULT 'shared-0.5';

CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateCard_version_key" ON "RateCard"("version");

CREATE INDEX "RateCard_active_idx" ON "RateCard"("active");

INSERT INTO "RateCard" ("id", "version", "active", "data", "effectiveAt")
VALUES (
    'ratecard_v1_seed',
    1,
    true,
    '{
      "version": 1,
      "effectiveAt": "2026-07-16T00:00:00.000Z",
      "currency": "usd",
      "compute": {
        "cpuSecondUnits": 18,
        "gbSecondUnits": 2,
        "unitCents": 0.00032,
        "requestCents": 0.00012,
        "baseCentsPerMonth": 100,
        "egressCentsPerGib": 10
      },
      "machineSizes": [
        {"key": "shared-0.25", "label": "0.25 vCPU · 1 GiB", "vcpu": 0.25, "ramGb": 1, "cpuMillicores": 250, "ramMb": 1024, "computeUnitsPerSecond": 6.5},
        {"key": "shared-0.5", "label": "0.5 vCPU · 2 GiB", "vcpu": 0.5, "ramGb": 2, "cpuMillicores": 500, "ramMb": 2048, "computeUnitsPerSecond": 13},
        {"key": "dedicated-1", "label": "1 vCPU · 4 GiB", "vcpu": 1, "ramGb": 4, "cpuMillicores": 1000, "ramMb": 4096, "computeUnitsPerSecond": 26},
        {"key": "dedicated-2", "label": "2 vCPU · 8 GiB", "vcpu": 2, "ramGb": 8, "cpuMillicores": 2000, "ramMb": 8192, "computeUnitsPerSecond": 52},
        {"key": "dedicated-4", "label": "4 vCPU · 16 GiB", "vcpu": 4, "ramGb": 16, "cpuMillicores": 4000, "ramMb": 16384, "computeUnitsPerSecond": 104},
        {"key": "dedicated-8", "label": "8 vCPU · 32 GiB", "vcpu": 8, "ramGb": 32, "cpuMillicores": 8000, "ramMb": 32768, "computeUnitsPerSecond": 208}
      ],
      "planMaxMachineVcpu": {"free": 4, "starter": 8, "core": 8, "pro": 8, "team": 8, "enterprise": 8}
    }'::jsonb,
    '2026-07-16T00:00:00.000Z'
);
