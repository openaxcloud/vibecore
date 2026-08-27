import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * AGM: same-domain proxy for the client-safe agent mode availability. The IDE
 * composer asks which of Lite/Economy/Power the caller's plan may use and
 * whether High effort / Turbo are unlockable. The upstream payload contains NO
 * provider and NO model id — model names never reach the browser.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_ID_REQUIRED', 400, { extra: { ok: false } });
  }

  const payload = await apiRequest(request, `/projects/${encodeURIComponent(projectId)}/agent/routing`, {
    redirectOn401: false,
  });

  return json(payload);
}
