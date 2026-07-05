-- Real project preview thumbnails: store a signed/object URL to the latest
-- captured screenshot of the running preview, plus when it was captured.
ALTER TABLE "Project" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "thumbnailUpdatedAt" TIMESTAMP(3);
