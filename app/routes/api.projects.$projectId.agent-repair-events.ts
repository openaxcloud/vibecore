import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/*
 * IDE proxy for the durable agent self-repair audit log (backend contract §9).
 * GET lists the repair history (newest first); POST appends one event. Both
 * forward to the internal API `/projects/:id/agent-repair-events`, which gates
 * on project read / write respectively.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const limit = url.searchParams.get('limit');
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';

  const payload = await apiRequest(request, `/projects/${params.projectId}/agent-repair-events${query}`);

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.json().catch(() => ({}));

  const payload = await apiRequest(request, `/projects/${params.projectId}/agent-repair-events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return json(payload);
}
