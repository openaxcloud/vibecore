import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request, params }: EnterpriseActionArgs) {
  const installId = params.installId;

  if (!installId) {
    return json({ ok: false, error: 'Missing install id' }, { status: 400 });
  }

  const method = request.method.toUpperCase();

  if (method === 'PATCH') {
    const body = await request.text();

    const payload = await apiRequest(request, `/mcp/installs/${encodeURIComponent(installId)}`, {
      method: 'PATCH',
      body,
    });

    return json(payload);
  }

  if (method === 'DELETE') {
    const payload = await apiRequest(request, `/mcp/installs/${encodeURIComponent(installId)}`, {
      method: 'DELETE',
    });
    return json(payload);
  }

  return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}
