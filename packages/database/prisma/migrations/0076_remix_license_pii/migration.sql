-- P0-V3-05 (RMX-3): versioned license + consent + PII masking on secure remix.
-- GalleryListing: curation-time license snapshot + remix gate + author PII consent.
ALTER TABLE "GalleryListing" ADD COLUMN "remixAllowed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GalleryListing" ADD COLUMN "licenseId" TEXT;
ALTER TABLE "GalleryListing" ADD COLUMN "licenseText" TEXT;
ALTER TABLE "GalleryListing" ADD COLUMN "licenseTextSha256" TEXT;
ALTER TABLE "GalleryListing" ADD COLUMN "piiConsentVersion" TEXT;

-- RemixJob: what THIS remix was accepted under (immutable), and what was masked.
ALTER TABLE "RemixJob" ADD COLUMN "licenseSnapshot" JSONB;
ALTER TABLE "RemixJob" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "RemixJob" ADD COLUMN "piiFindings" JSONB;
ALTER TABLE "RemixJob" ADD COLUMN "piiMaskedCount" INTEGER NOT NULL DEFAULT 0;
