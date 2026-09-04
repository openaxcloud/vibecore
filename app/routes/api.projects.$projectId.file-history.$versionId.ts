import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId || !params.versionId) {
    return json({ ok: false, error: 'File History version not found' }, { status: 404 });
  }

  const query = new URL(request.url).search;

  const payload = await apiRequest(
    request,
    `/projects/${encodeURIComponent(params.projectId)}/file-history/${encodeURIComponent(params.versionId)}${query}`,
  );

  return json(payload, { headers: { 'cache-control': 'no-store' } });
}
