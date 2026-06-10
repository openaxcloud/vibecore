-- Track the Stripe event.created of the latest applied subscription event so the
-- webhook can drop out-of-order deliveries (wave 25 #8). Nullable + additive.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastStripeEventAt" TIMESTAMP(3);
