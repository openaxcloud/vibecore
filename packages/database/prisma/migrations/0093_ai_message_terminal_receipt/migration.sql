-- Additive: old messages remain readable with an unknown terminal outcome.
ALTER TABLE "AiMessage" ADD COLUMN "terminalReceipt" JSONB;
