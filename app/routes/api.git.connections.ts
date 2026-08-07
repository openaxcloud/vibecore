import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * Browser-accessible proxy for the Git pane's Settings → Connections section.
 * The IDE GitSettingsPanel (a client component) needs to LIST the user's OAuth
 * provider connections and DISCONNECT one, but those live on the API service
 * (`/api/account/connections`). The dashboard's connected-accounts page reads
 * them in its server loader; the IDE panel reads them through this resource
 * route so the same data + revoke action are reachable from a `fetch()`.
 */
type IntegrationConnection = {
  id: string;
  provider: string;
  externalAccountLabel: string;
  status: string;
  forAgentUse: boolean;
  revokedAt: string | null;
  createdAt: string;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const result = await apiRequest<{ connections: IntegrationConnection[] }>(request, '/api/account/connections').catch(
    () => ({ connections: [] as IntegrationConnection[] }),
  );

  return Response.json({ connections: result.connections });
}

export async function action({ request }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const userConnectionId = String(form.get('userConnectionId') ?? '').trim();

  if (intent !== 'revoke' || !userConnectionId) {
    return remainingApiErrorResponse(request, 'CONNECTION_REVOKE_REQUEST_INVALID', 400);
  }

  try {
    const result = await apiRequest<{ userConnectionId: string; status: string }>(
      request,
      `/api/account/connections/${encodeURIComponent(userConnectionId)}/revoke`,
      { method: 'POST' },
    );

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    return remainingApiErrorResponse(request, 'CONNECTION_REVOKE_FAILED', status);
  }
}
