ALTER TABLE "VerifiedDomain" ADD COLUMN "redirectWww" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VerifiedDomain" ADD COLUMN "wildcardEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VerifiedDomain" ADD COLUMN "sslStatus" TEXT NOT NULL DEFAULT 'pending_dns';
