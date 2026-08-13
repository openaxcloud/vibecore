import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/*
 * IDE audit #3: proxy the in-IDE settings panel to the platform API so user
 * preferences (notifications, language, timezone, feature toggles, profile)
 * persist to the DB instead of localStorage-only. The session cookie is
 * forwarded by `apiRequest`; unauthenticated IDE sessions get a 401 that the
 * client treats as "no backend account — keep using localStorage".
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const payload = await apiRequest(request, '/user/preferences', { redirectOn401: false });

  return json(payload);
}

export async function action({ request }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'PATCH') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.text();
  const payload = await apiRequest(request, '/user/preferences', { method: 'PATCH', body, redirectOn401: false });

  return json(payload);
}
