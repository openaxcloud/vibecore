import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.text();
  const payload = await apiRequest(request, '/agent-memory/context', { method: 'POST', body });

  return json(payload);
}
