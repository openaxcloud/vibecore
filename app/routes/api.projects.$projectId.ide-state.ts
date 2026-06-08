import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const payload = await apiRequest(request, `/projects/${params.projectId}/ide-state`);

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  if (request.method.toUpperCase() !== 'PUT') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.text();

  /*
   * Forward the conditional header so the API enforces optimistic concurrency
   * (412 on version mismatch) instead of silently last-write-wins across tabs.
   */
  const ifMatch = request.headers.get('if-match') ?? undefined;

  const payload = await apiRequest(request, `/projects/${params.projectId}/ide-state`, {
    method: 'PUT',
    body,
    headers: ifMatch ? { 'if-match': ifMatch } : undefined,
  });

  return json(payload);
}
