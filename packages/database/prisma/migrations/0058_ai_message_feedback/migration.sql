-- Assistant-message 👍/👎 feedback (2026-07-03). "messageId" is the
-- client-side chat message id — standalone chats keep their transcript in
-- browser IndexedDB and never persist an AiMessage row, so there is
-- deliberately no AiMessage FK. One row per (userId, messageId): repeat votes
-- upsert, retracting a vote (toggling the thumb off) deletes the row.
CREATE TABLE IF NOT EXISTS "AiMessageFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "chatId" TEXT,
    "vote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMessageFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiMessageFeedback_userId_messageId_key" ON "AiMessageFeedback"("userId", "messageId");

CREATE INDEX IF NOT EXISTS "AiMessageFeedback_messageId_idx" ON "AiMessageFeedback"("messageId");

ALTER TABLE "AiMessageFeedback" ADD CONSTRAINT "AiMessageFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;