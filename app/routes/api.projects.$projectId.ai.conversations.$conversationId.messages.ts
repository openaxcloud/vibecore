import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

function conversationMessagesPath(projectId: string, conversationId: string) {
  return `/projects/${encodeURIComponent(projectId)}/ai/conversations/${encodeURIComponent(conversationId)}/messages`;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId || !params.conversationId) {
    return remainingApiErrorResponse(request, 'CONVERSATION_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const payload = await apiRequest(request, conversationMessagesPath(params.projectId, params.conversationId));

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.conversationId) {
    return remainingApiErrorResponse(request, 'CONVERSATION_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method.toUpperCase() !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = await request.text();

  const payload = await apiRequest(request, conversationMessagesPath(params.projectId, params.conversationId), {
    method: 'POST',
    body,
  });

  return json(payload, { status: 201 });
}
