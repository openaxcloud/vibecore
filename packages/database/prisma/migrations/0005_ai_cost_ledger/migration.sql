CREATE TABLE "AiCostLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCostLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCostLedger_organizationId_createdAt_idx" ON "AiCostLedger"("organizationId", "createdAt");
CREATE INDEX "AiCostLedger_projectId_idx" ON "AiCostLedger"("projectId");
CREATE INDEX "AiCostLedger_conversationId_idx" ON "AiCostLedger"("conversationId");

ALTER TABLE "AiCostLedger" ADD CONSTRAINT "AiCostLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
