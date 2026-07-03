-- Optional per-organization billing CC address (2026-07-03). Set from the
-- Payment method page; the spend-alert emails CC it when present.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "billingEmail" TEXT;
