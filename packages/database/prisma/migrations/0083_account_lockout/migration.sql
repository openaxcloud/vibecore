-- Per-account brute-force / credential-stuffing lock (defence-in-depth on top of
-- the per-IP login rate limit). One row per user; the failed-login counter is
-- incremented atomically in a row-locked transaction (see login-throttle.ts).
CREATE TABLE "AccountLockout" (
    "userId" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "firstFailedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLockout_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "AccountLockout_lockedUntil_idx" ON "AccountLockout"("lockedUntil");

ALTER TABLE "AccountLockout" ADD CONSTRAINT "AccountLockout_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
