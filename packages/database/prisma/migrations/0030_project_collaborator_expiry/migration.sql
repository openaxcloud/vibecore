-- Time-limited share links previously granted a PERMANENT ProjectCollaborator
-- row on redemption (no expiry column). Add an optional expiry so the redemption
-- can persist the link's expiresAt and role-resolution can ignore expired grants.
-- Nullable, no backfill: existing collaborators have no expiry (direct invites).
ALTER TABLE "ProjectCollaborator" ADD COLUMN "expiresAt" TIMESTAMP(3);
