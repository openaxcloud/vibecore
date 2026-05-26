-- Durable project archive objects used when API pods cannot read another
-- replica's local snapshot/export cache.

CREATE TABLE "ProjectStorageObject" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contentBase64" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectStorageObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectStorageObject_key_key" ON "ProjectStorageObject"("key");
CREATE INDEX "ProjectStorageObject_projectId_idx" ON "ProjectStorageObject"("projectId");
CREATE INDEX "ProjectStorageObject_kind_idx" ON "ProjectStorageObject"("kind");
CREATE INDEX "ProjectStorageObject_createdAt_idx" ON "ProjectStorageObject"("createdAt");

ALTER TABLE "ProjectStorageObject" ADD CONSTRAINT "ProjectStorageObject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
