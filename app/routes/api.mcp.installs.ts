import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const payload = await apiRequest(request, `/mcp/installs${query ? `?${query}` : ''}`);

  return json(payload);
}

export async function action({ request }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = await request.text();
  const payload = await apiRequest(request, '/mcp/installs', { method: 'POST', body });

  return json(payload, { status: 201 });
}
