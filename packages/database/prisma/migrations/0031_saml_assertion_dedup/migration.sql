-- One-time-use SAML assertion dedup: record consumed assertion IDs per org so a
-- captured-but-still-valid SAMLResponse cannot be replayed within its window.
CREATE TABLE "SamlAssertion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assertionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SamlAssertion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SamlAssertion_organizationId_assertionId_key" ON "SamlAssertion"("organizationId", "assertionId");
CREATE INDEX "SamlAssertion_expiresAt_idx" ON "SamlAssertion"("expiresAt");
