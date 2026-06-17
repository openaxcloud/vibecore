-- Replit-parity DB point-in-time rollback (Pro: 28-day window). Phase-1
-- scaffold: the managed-database instance plus its snapshot/restore recovery
-- points. All additive and DORMANT — provisioning and WAL-based restore are
-- wired in later phases and gated behind DB_ROLLBACK_ENABLED, so nothing reads
-- or writes these tables until the feature ships. See docs/REPLIT_PARITY_MATRIX.md §D.

-- Enums.
DO $$ BEGIN
  CREATE TYPE "DatabaseInstanceStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DatabaseRestoreStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- DatabaseInstance: one managed Postgres database per project.
CREATE TABLE IF NOT EXISTS "DatabaseInstance" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" "DatabaseInstanceStatus" NOT NULL DEFAULT 'PROVISIONING',
  "engine" TEXT NOT NULL DEFAULT 'postgres',
  "region" TEXT,
  "sizeBytes" BIGINT NOT NULL DEFAULT 0,
  "retentionDays" INTEGER NOT NULL DEFAULT 7,
  "pitrEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DatabaseInstance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DatabaseInstance_projectId_key" ON "DatabaseInstance" ("projectId");
CREATE INDEX IF NOT EXISTS "DatabaseInstance_organizationId_idx" ON "DatabaseInstance" ("organizationId");
CREATE INDEX IF NOT EXISTS "DatabaseInstance_status_idx" ON "DatabaseInstance" ("status");

-- DatabaseSnapshot: a recovery point (auto/manual) with WAL LSN + retention horizon.
CREATE TABLE IF NOT EXISTS "DatabaseSnapshot" (
  "id" TEXT NOT NULL,
  "databaseInstanceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'auto',
  "label" TEXT,
  "lsn" TEXT,
  "sizeBytes" BIGINT NOT NULL DEFAULT 0,
  "storageKey" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "DatabaseSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DatabaseSnapshot_databaseInstanceId_createdAt_idx" ON "DatabaseSnapshot" ("databaseInstanceId", "createdAt");
CREATE INDEX IF NOT EXISTS "DatabaseSnapshot_expiresAt_idx" ON "DatabaseSnapshot" ("expiresAt");

-- DatabaseRestore: a point-in-time restore request (snapshot or arbitrary timestamp).
CREATE TABLE IF NOT EXISTS "DatabaseRestore" (
  "id" TEXT NOT NULL,
  "databaseInstanceId" TEXT NOT NULL,
  "snapshotId" TEXT,
  "targetTimestamp" TIMESTAMP(3),
  "status" "DatabaseRestoreStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "DatabaseRestore_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DatabaseRestore_databaseInstanceId_createdAt_idx" ON "DatabaseRestore" ("databaseInstanceId", "createdAt");
CREATE INDEX IF NOT EXISTS "DatabaseRestore_status_idx" ON "DatabaseRestore" ("status");

-- Foreign keys (Cascade from project / instance, matching the Prisma relations).
DO $$ BEGIN
  ALTER TABLE "DatabaseInstance"
    ADD CONSTRAINT "DatabaseInstance_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "DatabaseSnapshot"
    ADD CONSTRAINT "DatabaseSnapshot_databaseInstanceId_fkey"
    FOREIGN KEY ("databaseInstanceId") REFERENCES "DatabaseInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "DatabaseRestore"
    ADD CONSTRAINT "DatabaseRestore_databaseInstanceId_fkey"
    FOREIGN KEY ("databaseInstanceId") REFERENCES "DatabaseInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
