-- Replit-parity usage-based spend alerts (50/80/100% of the budget cap).
-- De-dup marker on the wallet: the highest alert rung sent in the current
-- billing period + that period's start, so each rung fires once and the ladder
-- resets per period. Additive + nullable + DORMANT until BILLING_CREDITS_ENABLED.
-- See services/api/src/spend-alerts.ts.

ALTER TABLE "CreditWallet" ADD COLUMN IF NOT EXISTS "lastSpendAlertPct" INTEGER;
ALTER TABLE "CreditWallet" ADD COLUMN IF NOT EXISTS "lastSpendAlertPeriodStart" TIMESTAMP(3);
