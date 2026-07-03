-- Replit-parity per-user spend limit (Enterprise): an admin can cap an
-- individual member's usage-based spend below the org default. Additive.

-- CreateTable
CREATE TABLE "UserSpendLimit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limitCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSpendLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSpendLimit_organizationId_userId_key" ON "UserSpendLimit"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "UserSpendLimit_organizationId_idx" ON "UserSpendLimit"("organizationId");

-- AddForeignKey
ALTER TABLE "UserSpendLimit" ADD CONSTRAINT "UserSpendLimit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpendLimit" ADD CONSTRAINT "UserSpendLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
