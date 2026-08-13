import { apiRequest, isApiResponse, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

/*
 * Browser-accessible proxy for configuring an API-key connector (the non-OAuth
 * providers). ConnectorApiKeyConnectButton POSTs
 * `/api/integrations/api-key/:provider/configure` with `{ apiKey, projectId? }`;
 * the handler lives on the API service. Without this resource route the POST fell
 * through to the SPA catch-all and 405'd. We forward the body to the API, which
 * validates the key and stores it encrypted, and surface its real error verbatim.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const provider = String(params.provider ?? '').toLowerCase();

  if (!provider) {
    return Response.json({ error: 'A provider is required.' }, { status: 400 });
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
    return Response.json({ error: 'An API key is required.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<{ userConnectionId: string; accountLabel: string }>(
      request,
      `/api/integrations/api-key/${encodeURIComponent(provider)}/configure`,
      { method: 'POST', body: JSON.stringify({ apiKey, projectId }), redirectOn401: false },
    );

    return Response.json(result);
  } catch (error) {
    if (isApiResponse(error)) {
      return error;
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to configure this connector.' },
      { status: 502 },
    );
  }
}
