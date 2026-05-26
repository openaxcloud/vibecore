import { apiErrorMessage, apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'POST') {
    throw json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const projectId = params.projectId;

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  try {
    const payload = await apiRequest(request, `/projects/${encodeURIComponent(projectId)}/files/import/zip`, {
      method: 'POST',
      body: await request.text(),
    });

    return json(payload, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project import unavailable');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw json({ ok: false, error: message }, { status });
  }
}
