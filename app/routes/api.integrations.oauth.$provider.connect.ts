import { apiRequest, isApiResponse, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * Browser-accessible proxy for starting an integration OAuth flow from the IDE
 * Git pane (Settings → Connections → "Connect <provider>"). The GitSettingsPanel
 * client component POSTs `/api/integrations/oauth/:provider/connect`; the actual
 * handler lives on the API service. Without this resource route the POST fell
 * through to the SPA catch-all (`$.tsx`, GET-only) and answered 405 with the HTML
 * shell — which surfaced in the UI as "Failed to start GitHub OAuth (HTTP 405)".
 *
 * We forward the request (and its `{ projectId }` body) to the API, which
 * validates the project/org, checks the provider's OAuth credentials, and returns
 * the provider authorization URL for the popup. Upstream failures keep a safe
 * status but are mapped to localized public copy instead of exposing internals.
 */
const SUPPORTED_PROVIDERS = new Set(['github', 'gitlab', 'bitbucket']);

export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
  }

  const provider = String(params.provider ?? '').toLowerCase();

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return remainingApiErrorResponse(request, 'OAUTH_PROVIDER_UNSUPPORTED', 400, { values: { provider } });
  }

  let projectId: string | undefined;

  try {
    const body = (await request.json()) as { projectId?: unknown };
    projectId = typeof body?.projectId === 'string' && body.projectId.trim() ? body.projectId : undefined;
  } catch {
    projectId = undefined;
  }

  try {
    const result = await apiRequest<{ provider: string; authorizationUrl: string }>(
      request,
      `/api/integrations/oauth/${encodeURIComponent(provider)}/connect`,
      { method: 'POST', body: JSON.stringify({ projectId }), redirectOn401: false },
    );

    return Response.json(result);
  } catch (error) {
    /* apiRequest may throw a provider response; retain only a safe status. */
    const status = isApiResponse(error) && error.status !== 500 ? error.status : 502;

    return remainingApiErrorResponse(request, 'OAUTH_START_FAILED', status);
  }
}
