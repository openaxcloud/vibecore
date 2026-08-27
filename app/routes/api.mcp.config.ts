import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/**
 * Proxies the per-user MCP "Configuration" tab state to the platform API
 * (audit H5). GET returns `{ config: { mcpServers }, maxLLMSteps }`; PUT
 * persists the same shape. The MCP store reads/writes this instead of relying
 * on localStorage alone, so the chat/agent runtime can load it server-side.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const payload = await apiRequest(request, '/mcp/config');

  return json(payload);
}

export async function action({ request }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'PUT') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = await request.text();
  const payload = await apiRequest(request, '/mcp/config', { method: 'PUT', body });

  return json(payload);
}
