-- Enterprise SSO enforcement (F15): an org admin can require members to sign in
-- through SSO, with a 7-day grace window (measured from ssoEnforcedAt) and org
-- owners exempt. Additive columns on the existing enterprise settings row.
ALTER TABLE "EnterpriseOrganizationSettings" ADD COLUMN "ssoEnforced" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EnterpriseOrganizationSettings" ADD COLUMN "ssoEnforcedAt" TIMESTAMP(3);
