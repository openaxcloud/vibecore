import { apiRequest } from '~/lib/enterprise-api.server';
import { mergeMcpConfigs, type InstalledMcp } from '~/lib/mcp/install-config';
import type { MCPConfig } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('mcp.load-config');

interface UserConfigResponse {
  config?: MCPConfig;
  maxLLMSteps?: number;
}

interface InstallsResponse {
  installs?: InstalledMcp[];
}

/**
 * Assemble the live `MCPConfig` for a chat/agent request (audit C2/H7).
 *
 * Reads two sources from the platform API, authenticated with the caller's
 * session cookie:
 *   - `GET /mcp/config`   — the user's manually-authored "Configuration" tab
 *     servers (audit H5).
 *   - `GET /mcp/installs` — the user's marketplace installs, each carrying its
 *     catalog `configTemplate` + the user's `configJson`.
 *
 * Both are merged (installs folded in by alias, manual servers winning on
 * collision) into a single config the runtime can consume. Failures on either
 * call are tolerated — an unauthenticated or API-unreachable request simply
 * yields whatever could be read, never breaking the chat stream.
 */
export async function loadUserMcpConfig(request: Request): Promise<{ mcpConfig: MCPConfig; maxLLMSteps?: number }> {
  let configTab: MCPConfig | undefined;
  let maxLLMSteps: number | undefined;
  let installs: InstalledMcp[] = [];

  try {
    const res = await apiRequest<UserConfigResponse>(request, '/mcp/config', { redirectOn401: false });

    if (res?.config?.mcpServers) {
      configTab = res.config;
    }

    maxLLMSteps = res?.maxLLMSteps;
  } catch (error) {
    logger.debug('Could not load user MCP configuration', error);
  }

  try {
    const res = await apiRequest<InstallsResponse>(request, '/mcp/installs', { redirectOn401: false });
    installs = res?.installs ?? [];
  } catch (error) {
    logger.debug('Could not load MCP marketplace installs', error);
  }

  return { mcpConfig: mergeMcpConfigs(configTab, installs), maxLLMSteps };
}
