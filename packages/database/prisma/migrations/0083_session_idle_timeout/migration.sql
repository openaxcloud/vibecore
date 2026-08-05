-- Session idle/inactivity timeout: track the last authenticated activity per
-- session so an unused (possibly stolen) token is rejected well before its
-- absolute expiry. Nullable — existing rows fall back to createdAt in the check.
ALTER TABLE "Session" ADD COLUMN "lastActiveAt" TIMESTAMP(3);

CREATE INDEX "Session_lastActiveAt_idx" ON "Session"("lastActiveAt");
