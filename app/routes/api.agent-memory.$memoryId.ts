import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.memoryId) {
    return remainingApiErrorResponse(request, 'MEMORY_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const method = request.method.toUpperCase();

  if (method !== 'PATCH' && method !== 'DELETE') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = method === 'PATCH' ? await request.text() : undefined;

  const payload = await apiRequest(request, `/agent-memory/${encodeURIComponent(params.memoryId)}`, {
    method,
    ...(body ? { body } : {}),
  });

  return json(payload);
}
