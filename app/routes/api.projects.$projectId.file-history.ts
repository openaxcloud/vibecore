import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

function upstreamPath(request: Request, projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/file-history${new URL(request.url).search}`;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const payload = await apiRequest(request, upstreamPath(request, params.projectId));

  return json(payload, { headers: { 'cache-control': 'no-store' } });
}
