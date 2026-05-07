import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.memoryId) {
    return json({ ok: false, error: 'Memory not found' }, { status: 404 });
  }

  const method = request.method.toUpperCase();

  if (method !== 'PATCH' && method !== 'DELETE') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = method === 'PATCH' ? await request.text() : undefined;

  const payload = await apiRequest(request, `/agent-memory/${encodeURIComponent(params.memoryId)}`, {
    method,
    ...(body ? { body } : {}),
  });

  return json(payload);
}
