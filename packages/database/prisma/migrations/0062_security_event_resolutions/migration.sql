-- F23: operator resolution overlay for security events. ADDITIVE ONLY — a single
-- new SecurityEventResolution table keyed (unique) by the AuditLog id it resolves.
-- No ALTER/DROP/RENAME on any existing table; the append-only AuditLog is untouched.
-- Reversible by dropping "SecurityEventResolution".

-- CreateTable
CREATE TABLE "SecurityEventResolution" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityEventResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityEventResolution_auditLogId_key" ON "SecurityEventResolution"("auditLogId");

-- CreateIndex
CREATE INDEX "SecurityEventResolution_auditLogId_idx" ON "SecurityEventResolution"("auditLogId");
