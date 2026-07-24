-- Gallery card preview image. Each published listing carries a real rendered
-- screenshot of its app so the public grid shows a preview thumbnail instead of
-- a text-only card. Root-relative static asset (/gallery-apps/<id>/thumbnail.png)
-- or an https URL; nullable so pre-existing rows and un-captured listings stay
-- valid and simply render the text-only card.
ALTER TABLE "GalleryListing" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;
