import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

function conversationsPath(projectId: string, request?: Request) {
  const search = request ? new URL(request.url).search : '';

  return `/projects/${encodeURIComponent(projectId)}/ai/conversations${search}`;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const payload = await apiRequest(request, conversationsPath(params.projectId, request));

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method.toUpperCase() !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = await request.text();

  const payload = await apiRequest(request, conversationsPath(params.projectId), {
    method: 'POST',
    body,
  });

  return json(payload, { status: 201 });
}
