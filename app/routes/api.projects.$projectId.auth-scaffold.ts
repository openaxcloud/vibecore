import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * IDE proxy for "Add Authentication" — POSTs to the internal API
 * `/projects/:id/auth/scaffold`, which writes the real auth scaffold files into
 * the project (gated behind AUTH_SCAFFOLD_ENABLED) and provisions AUTH_JWT_SECRET.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  try {
    const payload = await apiRequest(request, `/projects/${params.projectId}/auth/scaffold`, { method: 'POST' });

    return json(payload);
  } catch (error) {
    if (error instanceof Response) {
      const body = (await error.json().catch(() => ({}))) as { error?: string; code?: string };

      return remainingApiErrorResponse(
        request,
        body.code === 'FEATURE_NOT_ENABLED' ? 'AUTH_SCAFFOLD_DISABLED' : 'AUTH_SCAFFOLD_FAILED',
        error.status,
        { extra: { ok: false } },
      );
    }

    return remainingApiErrorResponse(request, 'AUTH_SCAFFOLD_UNAVAILABLE', 502, { extra: { ok: false } });
  }
}
