import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'POST') {
    throw remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const projectId = params.projectId;

  if (!projectId) {
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  try {
    const payload = await apiRequest(request, `/projects/${encodeURIComponent(projectId)}/files/import/zip`, {
      method: 'POST',
      body: await request.text(),
    });

    return json(payload, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw remainingApiErrorResponse(
      request,
      status === 401 || status === 403 ? 'PROJECT_IMPORT_AUTH_REQUIRED' : 'PROJECT_IMPORT_FAILED',
      status,
      { extra: { ok: false } },
    );
  }
}
