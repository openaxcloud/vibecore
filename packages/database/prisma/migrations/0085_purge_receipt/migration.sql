-- RR-CODEX-14 (P6): erasure receipt written in the SAME tx as the tombstone.

CREATE TABLE "PurgeReceipt" (
    "userId" TEXT NOT NULL,
    "purgedAt" TIMESTAMP(3) NOT NULL,
    "proof" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurgeReceipt_pkey" PRIMARY KEY ("userId")
);
