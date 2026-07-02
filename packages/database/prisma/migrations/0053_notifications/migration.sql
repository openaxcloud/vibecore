-- Per-user in-app notification feed (2026-07-02). A durable, user-scoped inbox
-- surfaced in the SaaS account area: producers write a row, the user lists
-- unread + recent and marks items read. The first real producer is the
-- connector reconnection alert (an unread Notification is dropped alongside the
-- ReconnectionAlert), so the feed is non-empty in reality. The composite index
-- serves the "this user's rows, unread first / newest first" feed query.
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx"
    ON "Notification" ("userId", "readAt", "createdAt");

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
