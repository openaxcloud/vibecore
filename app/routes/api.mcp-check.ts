import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { apiRequest } from '~/lib/enterprise-api.server';
import { MCPService } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-check');

/**
 * Strip credentials (config.env / config.headers) and the live client handle
 * from a server-tools map before it is serialized to the browser — the config
 * carries API keys / Authorization headers that must never leave the server.
 */
function sanitizeServerTools(serverTools: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(serverTools).map(([name, server]) => {
      const record = server as {
        status?: unknown;
        tools?: unknown;
        error?: unknown;
        config?: Record<string, unknown>;
      };

      const safeConfig = record.config ? { ...record.config, env: undefined, headers: undefined } : undefined;

      return [name, { status: record.status, tools: record.tools, error: record.error, config: safeConfig }];
    }),
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  /*
   * Require an authenticated session. This route reads the connected MCP server
   * state from a process-wide singleton; left unauthenticated it leaked other
   * users' connector configuration. apiRequest throws a 401 Response (not a
   * redirect, for an API caller) when there is no valid session.
   */
  await apiRequest(request, '/orgs', { redirectOn401: false });

  try {
    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.checkServersAvailabilities();

    return Response.json(sanitizeServerTools(serverTools as Record<string, unknown>));
  } catch (error) {
    logger.error('Error checking MCP servers:', error);
    return Response.json({ error: 'Failed to check MCP servers' }, { status: 500 });
  }
}
