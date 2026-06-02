-- Audit M5/M7: move shared conversation snapshots out of the URL and into the
-- server. A share mints a random, HMAC-signed token (stored here only as a
-- sha256 hash) that the public /share view redeems to load `payloadJson`.
-- Standalone table (no FK) so a snapshot survives project/author deletion.

CREATE TABLE "ChatShare" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT,
    "payloadJson" JSONB NOT NULL,
    "allowFork" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatShare_tokenHash_key" ON "ChatShare"("tokenHash");

CREATE INDEX "ChatShare_projectId_idx" ON "ChatShare"("projectId");

CREATE INDEX "ChatShare_authorUserId_idx" ON "ChatShare"("authorUserId");
