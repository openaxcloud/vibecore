import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

function conversationMessagesPath(projectId: string, conversationId: string) {
  return `/projects/${encodeURIComponent(projectId)}/ai/conversations/${encodeURIComponent(conversationId)}/messages`;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId || !params.conversationId) {
    return json({ ok: false, error: 'Conversation not found' }, { status: 404 });
  }

  const payload = await apiRequest(request, conversationMessagesPath(params.projectId, params.conversationId));

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.conversationId) {
    return json({ ok: false, error: 'Conversation not found' }, { status: 404 });
  }

  if (request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.text();

  const payload = await apiRequest(request, conversationMessagesPath(params.projectId, params.conversationId), {
    method: 'POST',
    body,
  });

  return json(payload, { status: 201 });
}
