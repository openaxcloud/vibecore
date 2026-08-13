import { apiRequest, isApiResponse, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

/*
 * Browser-accessible proxy for disconnecting an integration account. The
 * connected-accounts page (and connector cards) POST
 * `/api/account/connections/:id/revoke` from the client; the handler lives on the
 * API service. Without this resource route the POST fell through to the SPA
 * catch-all and 405'd, so "Disconnect" silently failed. We forward to the API and
 * surface its real error verbatim.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const id = String(params.id ?? '').trim();

  if (!id) {
    return Response.json({ error: 'A connection id is required.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<{ userConnectionId: string; status: string }>(
      request,
      `/api/account/connections/${encodeURIComponent(id)}/revoke`,
      { method: 'POST', redirectOn401: false },
    );

    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (isApiResponse(error)) {
      return error;
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to disconnect this account.' },
      { status: 502 },
    );
  }
}
