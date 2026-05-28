import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.workspaceId) {
    return json({ ok: false, error: 'Workspace not found' }, { status: 404 });
  }

  const payload = await apiRequest(request, `/workspaces/${params.workspaceId}/ide-state`);

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.workspaceId) {
    return json({ ok: false, error: 'Workspace not found' }, { status: 404 });
  }

  if (request.method.toUpperCase() !== 'PUT') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.text();

  const payload = await apiRequest(request, `/workspaces/${params.workspaceId}/ide-state`, {
    method: 'PUT',
    body,
  });

  return json(payload);
}
