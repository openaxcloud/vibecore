import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.workspaceId) {
    return remainingApiErrorResponse(request, 'WORKSPACE_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const payload = await apiRequest(request, `/workspaces/${params.workspaceId}/ide-state`);

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.workspaceId) {
    return remainingApiErrorResponse(request, 'WORKSPACE_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method.toUpperCase() !== 'PUT') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = await request.text();

  /*
   * Forward the client's conditional header so the API can enforce optimistic
   * concurrency (412 on version mismatch). Without this, two tabs saving IDE
   * state concurrently silently last-write-wins, clobbering open tabs / cursor /
   * locked items — the entire If-Match protection was dead end-to-end.
   */
  const ifMatch = request.headers.get('if-match') ?? undefined;

  const payload = await apiRequest(request, `/workspaces/${params.workspaceId}/ide-state`, {
    method: 'PUT',
    body,
    headers: ifMatch ? { 'if-match': ifMatch } : undefined,
  });

  return json(payload);
}
