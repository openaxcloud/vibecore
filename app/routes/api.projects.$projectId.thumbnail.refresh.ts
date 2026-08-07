import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * P11 preview-ready trigger (client half). The IDE posts here once a project's
 * preview finishes booting; this proxies to the API's server-side capture
 * endpoint, which asks the screenshotter to render the preview and stores the
 * PNG. No bytes flow through the browser and there is no user gesture — the card
 * thumbnail refreshes automatically. Degrades to { enabled: false } (not an
 * error) when the screenshotter/object-storage is not configured.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const form = await request.formData().catch(() => null);
  const url = form?.get('url');

  if (typeof url !== 'string' || !url) {
    return remainingApiErrorResponse(request, 'THUMBNAIL_PREVIEW_URL_REQUIRED', 400, { extra: { ok: false } });
  }

  try {
    const result = await apiRequest<{ scheduled?: boolean; enabled?: boolean }>(
      request,
      `/projects/${params.projectId}/thumbnail/refresh`,
      { method: 'POST', body: JSON.stringify({ url }) },
    );

    return json({ ok: true, scheduled: Boolean(result?.scheduled), enabled: result?.enabled !== false });
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    if (status === 404) {
      return json({ ok: false, enabled: false }, { status: 404 });
    }

    return remainingApiErrorResponse(request, 'THUMBNAIL_REFRESH_FAILED', status, { extra: { ok: false } });
  }
}
