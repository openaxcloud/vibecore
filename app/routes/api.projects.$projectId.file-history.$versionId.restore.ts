import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.versionId) {
    return json({ ok: false, error: 'File History version not found' }, { status: 404 });
  }

  if (request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const payload = await apiRequest(
    request,
    `/projects/${encodeURIComponent(params.projectId)}/file-history/${encodeURIComponent(params.versionId)}/restore`,
    {
      method: 'POST',
      body: await request.text(),
      headers: { 'content-type': 'application/json' },
    },
  );

  return json(payload, { headers: { 'cache-control': 'no-store' } });
}
