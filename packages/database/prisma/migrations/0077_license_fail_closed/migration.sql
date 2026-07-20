-- Politique licence FAIL-CLOSED (directive Avi 20/07) :
-- un listing sans licence explicite n'est JAMAIS remixable.
ALTER TABLE "GalleryListing" ALTER COLUMN "remixAllowed" SET DEFAULT false;
-- Rétroactif : tout listing sans licence déclarée redevient non-remixable.
UPDATE "GalleryListing" SET "remixAllowed" = false WHERE "licenseId" IS NULL;
