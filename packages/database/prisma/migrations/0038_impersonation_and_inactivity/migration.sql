-- Replit-parity P8: admin impersonation traceability + account-inactivity GC.
-- Additive + nullable. Session.impersonatedBy marks an admin-as-user session
-- (audit/banner/revoke). User.lastActiveAt feeds the inactivity GC (free accounts
-- inactive >= 1 year are eligible for deletion; paid exempt). See
-- docs/REPLIT_PARITY_SPEC.md §16.5 and services/api/src/account-lifecycle.ts.

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
