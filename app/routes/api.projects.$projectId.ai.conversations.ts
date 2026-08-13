import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

function conversationsPath(projectId: string, request?: Request) {
  const search = request ? new URL(request.url).search : '';

  return `/projects/${encodeURIComponent(projectId)}/ai/conversations${search}`;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const payload = await apiRequest(request, conversationsPath(params.projectId, request));

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  if (request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.text();

  const payload = await apiRequest(request, conversationsPath(params.projectId), {
    method: 'POST',
    body,
  });

  return json(payload, { status: 201 });
}
