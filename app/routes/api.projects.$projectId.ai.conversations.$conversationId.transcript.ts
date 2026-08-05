import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.conversationId) {
    return remainingApiErrorResponse(request, 'CONVERSATION_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method.toUpperCase() !== 'PUT') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = await request.text();

  const payload = await apiRequest(
    request,
    `/projects/${encodeURIComponent(params.projectId)}/ai/conversations/${encodeURIComponent(
      params.conversationId,
    )}/transcript`,
    {
      method: 'PUT',
      body,
    },
  );

  return json(payload);
}
