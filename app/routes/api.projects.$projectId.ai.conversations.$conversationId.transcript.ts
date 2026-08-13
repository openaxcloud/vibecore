import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.conversationId) {
    return json({ ok: false, error: 'Conversation not found' }, { status: 404 });
  }

  if (request.method.toUpperCase() !== 'PUT') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
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
