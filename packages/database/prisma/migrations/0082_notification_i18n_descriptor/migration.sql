-- Add stable localization descriptors without rewriting historical copy.
-- Existing and older producers remain valid through the title/body fallback.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "messageKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "messageParams" JSONB;
