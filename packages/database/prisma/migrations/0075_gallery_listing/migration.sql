-- TPL-02 Gallery. A curated public listing of published apps (browse / search /
-- categories / detail / authors / public stats / View App / Remix), plus an
-- immutable release pin on the remix job so a fork reproduces the published
-- snapshot rather than the live source.
--
-- Curation, not self-service: rows are created by a curator/seed (see
-- DEC-GALLERY-NO-SELF-PUBLISH). Only status='PUBLISHED' rows are visible.

-- Immutable-release pin + provenance on the remix pipeline job.
ALTER TABLE "RemixJob" ADD COLUMN IF NOT EXISTS "sourceSnapshotId" TEXT;
ALTER TABLE "RemixJob" ADD COLUMN IF NOT EXISTS "sourceListingId" TEXT;

CREATE TABLE IF NOT EXISTS "GalleryListing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sourceProjectId" TEXT NOT NULL,
    "sourceSnapshotId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" TEXT,
    "appUrl" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "GalleryListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GalleryListing_slug_key" ON "GalleryListing"("slug");
CREATE INDEX IF NOT EXISTS "GalleryListing_status_category_idx" ON "GalleryListing"("status", "category");
CREATE INDEX IF NOT EXISTS "GalleryListing_status_featured_idx" ON "GalleryListing"("status", "featured");
CREATE INDEX IF NOT EXISTS "GalleryListing_status_createdAt_idx" ON "GalleryListing"("status", "createdAt");

-- onDelete: Cascade — a gallery listing cannot outlive its source project.
ALTER TABLE "GalleryListing"
    ADD CONSTRAINT "GalleryListing_sourceProjectId_fkey"
    FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- onDelete: SetNull — the denormalized authorName survives an author deletion.
ALTER TABLE "GalleryListing"
    ADD CONSTRAINT "GalleryListing_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
