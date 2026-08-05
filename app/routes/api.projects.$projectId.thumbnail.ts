import {
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * Serves a project's REAL captured preview thumbnail. The API returns a short-lived
 * signed object-storage URL for the latest screenshot; we 302 the <img> straight to
 * it. If no thumbnail has been captured yet (or it's unavailable) we return 404 so
 * the card shows its neutral placeholder instead of a fake mock.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return new Response(null, { status: 404 });
  }

  try {
    const result = await apiRequest<{ url?: string }>(request, `/projects/${params.projectId}/thumbnail`);

    if (!result?.url) {
      return new Response(null, { status: 404 });
    }

    return redirect(result.url);
  } catch {
    return new Response(null, { status: 404 });
  }
}

/*
 * Mints the signed PUT the browser uses to upload a freshly captured screenshot
 * straight into the project's own GCS bucket (bytes never transit our servers).
 * The backend pins the object key, so the client can only ever overwrite the one
 * thumbnail object. Returns { enabled: false } when object storage is off so the
 * caller can silently skip capture instead of surfacing an error.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  try {
    const signed = await apiRequest<{ url?: string; method?: string; headers?: Record<string, string> }>(
      request,
      `/projects/${params.projectId}/thumbnail/upload-url`,
      { method: 'POST', body: JSON.stringify({}) },
    );

    if (!signed?.url) {
      return remainingApiErrorResponse(request, 'THUMBNAIL_UPLOAD_FAILED', 502, { extra: { ok: false } });
    }

    return json({ ok: true, url: signed.url, method: signed.method ?? 'PUT', headers: signed.headers });
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    // A 404 means object storage is disabled for the platform — degrade quietly.
    if (status === 404) {
      return json({ ok: false, enabled: false }, { status: 404 });
    }

    return remainingApiErrorResponse(request, 'THUMBNAIL_UPLOAD_FAILED', status, { extra: { ok: false } });
  }
}
