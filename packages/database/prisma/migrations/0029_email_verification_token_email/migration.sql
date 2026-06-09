-- Bind email-verification tokens to the address they were issued for. At consume
-- time the user's current email must still match, preventing a stale token from
-- verifying an address the user changed away from. Nullable: existing tokens
-- (no email recorded) keep the prior userId-only behaviour until they expire.
ALTER TABLE "EmailVerificationToken" ADD COLUMN "email" TEXT;
