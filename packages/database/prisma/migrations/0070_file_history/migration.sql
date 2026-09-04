-- File History is a clean replacement for the dormant FileSnapshot scaffold.
-- No production data exists for FileSnapshot, and that table never stored file
-- bodies or had an API, so preserving its unusable rows would create false
-- history rather than compatibility.
DROP TABLE "FileSnapshot";

CREATE TABLE "FileHistoryBlob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contentBase64" TEXT NOT NULL,
    "encoding" TEXT NOT NULL DEFAULT 'utf8',
    "byteLength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileHistoryBlob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceKey" TEXT NOT NULL,
    "workspaceId" TEXT,
    "path" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorUserId" TEXT,
    "operationId" TEXT NOT NULL,
    "previousVersionId" TEXT,
    "restoredFromVersionId" TEXT,
    "renamedFromPath" TEXT,
    "tombstone" BOOLEAN NOT NULL DEFAULT false,
    "sequence" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FileHistoryBlob_projectId_contentHash_key"
    ON "FileHistoryBlob"("projectId", "contentHash");
CREATE INDEX "FileHistoryBlob_projectId_createdAt_idx"
    ON "FileHistoryBlob"("projectId", "createdAt");

CREATE UNIQUE INDEX "FileVersion_projectId_workspaceKey_operationId_key"
    ON "FileVersion"("projectId", "workspaceKey", "operationId");
CREATE INDEX "FileVersion_projectId_workspaceKey_path_sequence_idx"
    ON "FileVersion"("projectId", "workspaceKey", "path", "sequence");
CREATE INDEX "FileVersion_projectId_workspaceKey_lineageId_sequence_idx"
    ON "FileVersion"("projectId", "workspaceKey", "lineageId", "sequence");
CREATE INDEX "FileVersion_blobId_idx" ON "FileVersion"("blobId");
CREATE INDEX "FileVersion_actorUserId_idx" ON "FileVersion"("actorUserId");
CREATE INDEX "FileVersion_previousVersionId_idx" ON "FileVersion"("previousVersionId");
CREATE INDEX "FileVersion_restoredFromVersionId_idx" ON "FileVersion"("restoredFromVersionId");

ALTER TABLE "FileHistoryBlob"
    ADD CONSTRAINT "FileHistoryBlob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileVersion"
    ADD CONSTRAINT "FileVersion_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileVersion"
    ADD CONSTRAINT "FileVersion_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileVersion"
    ADD CONSTRAINT "FileVersion_blobId_fkey"
    FOREIGN KEY ("blobId") REFERENCES "FileHistoryBlob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileVersion"
    ADD CONSTRAINT "FileVersion_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileVersion"
    ADD CONSTRAINT "FileVersion_previousVersionId_fkey"
    FOREIGN KEY ("previousVersionId") REFERENCES "FileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileVersion"
    ADD CONSTRAINT "FileVersion_restoredFromVersionId_fkey"
    FOREIGN KEY ("restoredFromVersionId") REFERENCES "FileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FileHistoryWatchState" (
    "projectId" TEXT NOT NULL,
    "workspaceKey" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "reasons" JSONB NOT NULL,
    "droppedEvents" INTEGER NOT NULL DEFAULT 0,
    "snapshotTruncated" BOOLEAN NOT NULL DEFAULT false,
    "connectionTruncated" BOOLEAN NOT NULL DEFAULT false,
    "lastSequence" BIGINT,
    "reconciledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileHistoryWatchState_pkey" PRIMARY KEY ("projectId", "workspaceKey")
);

CREATE INDEX "FileHistoryWatchState_projectId_updatedAt_idx"
    ON "FileHistoryWatchState"("projectId", "updatedAt");

ALTER TABLE "FileHistoryWatchState"
    ADD CONSTRAINT "FileHistoryWatchState_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
