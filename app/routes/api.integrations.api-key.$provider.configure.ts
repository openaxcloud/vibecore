import { apiRequest, isApiResponse, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * Browser-accessible proxy for configuring an API-key connector (the non-OAuth
 * providers). ConnectorApiKeyConnectButton POSTs
 * `/api/integrations/api-key/:provider/configure` with `{ apiKey, projectId? }`;
 * the handler lives on the API service. Without this resource route the POST fell
 * through to the SPA catch-all and 405'd. We forward the body to the API, which
 * validates the key and stores it encrypted. Upstream failures are reduced to
 * a localized stable code so connector or validation details are never echoed.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
  }

  const provider = String(params.provider ?? '').toLowerCase();

  if (!provider) {
    return remainingApiErrorResponse(request, 'PROVIDER_REQUIRED', 400);
  }

  let apiKey = '';
  let projectId: string | undefined;

  try {
    const body = (await request.json()) as { apiKey?: unknown; projectId?: unknown };
    apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
    projectId = typeof body?.projectId === 'string' && body.projectId.trim() ? body.projectId : undefined;
  } catch {
    apiKey = '';
  }

  if (!apiKey.trim()) {
    return remainingApiErrorResponse(request, 'API_KEY_REQUIRED', 400);
  }

  try {
    const result = await apiRequest<{ userConnectionId: string; accountLabel: string }>(
      request,
      `/api/integrations/api-key/${encodeURIComponent(provider)}/configure`,
      { method: 'POST', body: JSON.stringify({ apiKey, projectId }), redirectOn401: false },
    );

    return Response.json(result);
  } catch (error) {
    const status = isApiResponse(error) && error.status !== 500 ? error.status : 502;

    return remainingApiErrorResponse(request, 'CONNECTOR_CONFIGURE_FAILED', status);
  }
}
