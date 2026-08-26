-- BUG-SEC-002 / BUG-QA-TOKEN-IN-LOGS: single-use runtime WebSocket tickets.
-- The raw credential is never stored and never appears in the request URL.

CREATE TABLE "RuntimeWebSocketTicket" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "resolvedWorkspaceId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RuntimeWebSocketTicket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RuntimeWebSocketTicket_endpoint_check" CHECK (
        "endpoint" IN ('commands/stream', 'terminal', 'logs', 'files/watch', 'ports/watch')
    )
);

CREATE UNIQUE INDEX "RuntimeWebSocketTicket_tokenHash_key" ON "RuntimeWebSocketTicket"("tokenHash");
CREATE INDEX "RuntimeWebSocketTicket_userId_idx" ON "RuntimeWebSocketTicket"("userId");
CREATE INDEX "RuntimeWebSocketTicket_projectId_idx" ON "RuntimeWebSocketTicket"("projectId");
CREATE INDEX "RuntimeWebSocketTicket_resolvedWorkspaceId_idx" ON "RuntimeWebSocketTicket"("resolvedWorkspaceId");
CREATE INDEX "RuntimeWebSocketTicket_expiresAt_idx" ON "RuntimeWebSocketTicket"("expiresAt");

ALTER TABLE "RuntimeWebSocketTicket"
ADD CONSTRAINT "RuntimeWebSocketTicket_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RuntimeWebSocketTicket"
ADD CONSTRAINT "RuntimeWebSocketTicket_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
