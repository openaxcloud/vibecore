-- RR-1bd27929: per-plan ownership of account-purge freezes (PurgePlan + PurgeFreeze).

-- CreateTable
CREATE TABLE "PurgePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurgePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurgeFreeze" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurgeFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurgePlan_userId_idx" ON "PurgePlan"("userId");
CREATE INDEX "PurgePlan_leaseExpiresAt_idx" ON "PurgePlan"("leaseExpiresAt");
CREATE UNIQUE INDEX "PurgeFreeze_resourceType_resourceId_planId_key" ON "PurgeFreeze"("resourceType", "resourceId", "planId");
CREATE INDEX "PurgeFreeze_resourceType_resourceId_idx" ON "PurgeFreeze"("resourceType", "resourceId");
CREATE INDEX "PurgeFreeze_planId_idx" ON "PurgeFreeze"("planId");

-- AddForeignKey
ALTER TABLE "PurgeFreeze" ADD CONSTRAINT "PurgeFreeze_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PurgePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
