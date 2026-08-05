import { type ActionFunctionArgs } from 'react-router';
import { apiRequest } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse, remainingApiRouteMessage } from '~/lib/i18n/catalogs/remaining-api-routes';
import { MCPService, type MCPConfig } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-update-config');

/**
 * Strip credentials (config.env / config.headers) and the live client handle
 * from a server-tools map before it is serialized to the browser.
 */
function sanitizeServerTools(request: Request, serverTools: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(serverTools).map(([name, server]) => {
      const record = server as {
        status?: unknown;
        tools?: unknown;
        error?: unknown;
        config?: Record<string, unknown>;
      };

      const safeConfig = record.config ? { ...record.config, env: undefined, headers: undefined } : undefined;

      return [
        name,
        {
          status: record.status,
          tools: record.tools,
          error: record.error ? remainingApiRouteMessage(request, 'MCP_SERVER_UNAVAILABLE') : undefined,
          config: safeConfig,
        },
      ];
    }),
  );
}

export async function action({ request }: ActionFunctionArgs) {
  /*
   * Require an authenticated session. updateConfig spawns MCP transports
   * (stdio child processes / outbound SSE/HTTP connections) inside the web pod,
   * so an unauthenticated caller could otherwise trigger arbitrary process
   * execution and SSRF. apiRequest throws a 401 Response when unauthenticated.
   */
  await apiRequest(request, '/orgs', { redirectOn401: false });

  /*
   * Use a PER-REQUEST instance, never MCPService.getInstance(). The singleton's
   * config / tools / credential-bearing clients are instance state on a shared
   * multi-tenant web pod, so one tenant's POSTed config leaked into another
   * tenant's concurrent request (and into /api/mcp-check). Construct + close()
   * locally. URL SSRF is enforced centrally in MCPService._validateServerConfig.
   */
  const mcpService = new MCPService();

  try {
    const mcpConfig = (await request.json().catch(() => null)) as MCPConfig | null;

    if (!mcpConfig || typeof mcpConfig !== 'object') {
      return remainingApiErrorResponse(request, 'MCP_CONFIG_INVALID', 400);
    }

    const serverTools = await mcpService.updateConfig(mcpConfig);

    return Response.json(sanitizeServerTools(request, serverTools as Record<string, unknown>));
  } catch (error) {
    logger.error('Error updating MCP config:', error);
    return remainingApiErrorResponse(request, 'MCP_UPDATE_FAILED', 500);
  } finally {
    await mcpService.close().catch(() => undefined);
  }
}
