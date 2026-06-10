-- Add missing indexes on hot-path / foreign-key columns (wave 24 #17/#18, wave 23 #3).
-- All are additive CREATE INDEX statements; concurrent-safe to run on a live DB
-- (without CONCURRENTLY here so it composes with Prisma's transactional migrate;
-- run CONCURRENTLY manually if the tables are very large and locking is a concern).

-- AiMessage: WHERE conversationId = ? ORDER BY createdAt DESC LIMIT 500 on every chat open.
CREATE INDEX IF NOT EXISTS "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- AiConversation foreign keys (listing + cascade on project/user delete).
CREATE INDEX IF NOT EXISTS "AiConversation_projectId_idx" ON "AiConversation"("projectId");
CREATE INDEX IF NOT EXISTS "AiConversation_userId_idx" ON "AiConversation"("userId");

-- AiToolCall.messageId (cascades from AiMessage delete).
CREATE INDEX IF NOT EXISTS "AiToolCall_messageId_idx" ON "AiToolCall"("messageId");

-- OAuthConnection.userId (looked up during auth/account flows).
CREATE INDEX IF NOT EXISTS "OAuthConnection_userId_idx" ON "OAuthConnection"("userId");

-- AbuseEvent: evaluateUsageAbuse filters by (organizationId, type) on the usage hot path.
CREATE INDEX IF NOT EXISTS "AbuseEvent_organizationId_type_createdAt_idx" ON "AbuseEvent"("organizationId", "type", "createdAt");
