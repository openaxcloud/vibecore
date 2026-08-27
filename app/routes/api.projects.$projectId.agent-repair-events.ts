import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * IDE proxy for the durable agent self-repair audit log (backend contract §9).
 * GET lists the repair history (newest first); POST appends one event. Both
 * forward to the internal API `/projects/:id/agent-repair-events`, which gates
 * on project read / write respectively.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';

  const payload = await apiRequest(request, `/projects/${params.projectId}/agent-repair-events${query}`);

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = await request.json().catch(() => ({}));

  const payload = await apiRequest(request, `/projects/${params.projectId}/agent-repair-events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return json(payload);
}
