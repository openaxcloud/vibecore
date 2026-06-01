-- Audit H5: persist the MCP "Configuration" tab server-side instead of
-- localStorage-only, so the chat/agent runtime can read a user's manually
-- configured MCP servers (alongside their marketplace installs) when building
-- the live tool set. One row per user; configJson holds `{ mcpServers: {…} }`.

CREATE TABLE "McpUserConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "configJson" JSONB NOT NULL DEFAULT '{}',
    "maxLLMSteps" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpUserConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpUserConfig_userId_key" ON "McpUserConfig"("userId");

ALTER TABLE "McpUserConfig" ADD CONSTRAINT "McpUserConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
