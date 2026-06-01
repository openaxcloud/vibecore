-- IDE audit #3 + #10: persist user-level settings server-side instead of
-- localStorage-only. `timezone` was accepted by PATCH /auth/me but silently
-- dropped (#10); `preferences` is the new JSON blob backing the in-IDE
-- settings panel (notifications, event logs, feature toggles, profile)
-- exposed via /user/preferences (#3). Both nullable: existing users keep
-- client-side detection/defaults until they explicitly save.

ALTER TABLE "User" ADD COLUMN "timezone" TEXT;
ALTER TABLE "User" ADD COLUMN "preferences" JSONB;
