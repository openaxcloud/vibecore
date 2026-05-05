import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const payload = await apiRequest(request, `/agent-memory${query ? `?${query}` : ''}`);

  return json(payload);
}

export async function action({ request }: EnterpriseActionArgs) {
  const method = request.method.toUpperCase();

  if (method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.text();
  const payload = await apiRequest(request, '/agent-memory', { method: 'POST', body });

  return json(payload);
}
