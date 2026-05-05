ALTER TABLE "SiemWebhook"
  ADD COLUMN "secretCiphertext" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastDeliveredAt" TIMESTAMP(3);

CREATE INDEX "SiemWebhook_organizationId_lastDeliveredAt_idx" ON "SiemWebhook"("organizationId", "lastDeliveredAt");
