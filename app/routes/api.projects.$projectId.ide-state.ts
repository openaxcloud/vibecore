import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';
import { forwardIdeStatePut } from '~/lib/persistence/ide-state-proxy.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const payload = await apiRequest(request, `/projects/${params.projectId}/ide-state`);

  return json(payload);
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method.toUpperCase() !== 'PUT') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  /*
   * Proxy directly (instead of through `apiRequest`) so the backend's
   * optimistic-concurrency contract survives end to end: a 412 must keep its
   * status, its `{ error, code, ideState }` body, and its `etag` header so the
   * client can re-merge and retry with a fresh `If-Match`. `apiRequest` reshapes
   * any non-OK body to `{ ok:false, error, code }` and drops headers, which
   * silently degrades the conflict path into last-write-wins across tabs.
   */
  return forwardIdeStatePut(request, `/projects/${params.projectId}/ide-state`);
}
