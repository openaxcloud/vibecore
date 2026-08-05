import { apiRequest, isApiResponse, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * Browser-accessible proxy for disconnecting an integration account. The
 * connected-accounts page (and connector cards) POST
 * `/api/account/connections/:id/revoke` from the client; the handler lives on the
 * API service. Without this resource route the POST fell through to the SPA
 * catch-all and 405'd, so "Disconnect" silently failed. We forward to the API and
 * expose a localized stable failure code without echoing upstream internals.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
  }

  const id = String(params.id ?? '').trim();

  if (!id) {
    return remainingApiErrorResponse(request, 'CONNECTION_ID_REQUIRED', 400);
  }

  try {
    const result = await apiRequest<{ userConnectionId: string; status: string }>(
      request,
      `/api/account/connections/${encodeURIComponent(id)}/revoke`,
      { method: 'POST', redirectOn401: false },
    );

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const status = isApiResponse(error) && error.status !== 500 ? error.status : 502;

    return remainingApiErrorResponse(request, 'CONNECTION_REVOKE_FAILED', status);
  }
}
