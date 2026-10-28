import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { json } from '~/lib/json-response';

const headers = { 'Cache-Control': 'no-store' };

/** Read-only authorization/budget gate; never creates a permit or exposes ledger details. */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (request.method !== 'GET') {
    return json({ bounded: true }, { status: 405, headers: { ...headers, Allow: 'GET' } });
  }

  if (!params.projectId) {
    return json({ bounded: true }, { status: 400, headers });
  }

  try {
    const value = await apiRequest<{ bounded?: unknown }>(
      request,
      `/projects/${encodeURIComponent(params.projectId)}/agent/explicit-run`,
      { redirectOn401: false },
    );

    if (!value || typeof value.bounded !== 'boolean' || 'error' in value) {
      return json({ bounded: true }, { status: 503, headers });
    }

    return json({ bounded: value.bounded }, { headers });
  } catch {
    return json({ bounded: true }, { status: 503, headers });
  }
}

export function action() {
  return json({ bounded: true }, { status: 405, headers: { ...headers, Allow: 'GET' } });
}
