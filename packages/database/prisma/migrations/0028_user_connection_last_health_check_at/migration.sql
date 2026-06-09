-- The connector token health-check sweep reused the user-facing `lastUsedAt` as
-- its cursor, overwriting it every ~30 minutes so "last used" became meaningless.
-- Add a dedicated cursor column for the sweep. Nullable, no backfill: a NULL
-- lastHealthCheckAt makes a connection eligible for the next sweep (same as the
-- prior NULL-lastUsedAt behaviour), so existing rows are picked up naturally.
ALTER TABLE "UserConnection" ADD COLUMN "lastHealthCheckAt" TIMESTAMP(3);
