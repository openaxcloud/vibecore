import { apiRequest, isApiResponse, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

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
 * the provider authorization URL for the popup. Upstream errors (e.g. provider
 * not configured → 503) are forwarded verbatim so the UI shows the real reason.
 */
const SUPPORTED_PROVIDERS = new Set(['github', 'gitlab', 'bitbucket']);

export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const provider = String(params.provider ?? '').toLowerCase();

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return Response.json({ error: `Unsupported provider "${provider}".` }, { status: 400 });
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
    /*
     * apiRequest throws a Response (status + JSON body) on an upstream non-2xx;
     * forward it so the panel surfaces the genuine error (provider not configured,
     * no organization membership, …) instead of a generic failure.
     */
    if (isApiResponse(error)) {
      return error;
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to start the OAuth flow.' },
      { status: 502 },
    );
  }
}
