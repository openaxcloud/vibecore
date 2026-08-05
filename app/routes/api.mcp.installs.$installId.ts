import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function action({ request, params }: EnterpriseActionArgs) {
  const installId = params.installId;

  if (!installId) {
    return remainingApiErrorResponse(request, 'MCP_INSTALL_ID_REQUIRED', 400, { extra: { ok: false } });
  }

  const method = request.method.toUpperCase();

  if (method === 'PATCH') {
    const body = await request.text();

    const payload = await apiRequest(request, `/mcp/installs/${encodeURIComponent(installId)}`, {
      method: 'PATCH',
      body,
    });

    return json(payload);
  }

  if (method === 'DELETE') {
    const payload = await apiRequest(request, `/mcp/installs/${encodeURIComponent(installId)}`, {
      method: 'DELETE',
    });
    return json(payload);
  }

  return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
}
