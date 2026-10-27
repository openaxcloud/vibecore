import { z } from 'zod';
import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

// Stable protocol codes; the UI translates its own outcome messages.
const DISABLED_REASON = 'disabled';
const DEADLINE_REASON = 'deadline';

const captureResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('stored') }),
  z.object({ status: z.literal('skipped'), reason: z.enum(['disabled', 'recent-success', 'failure-cooldown']) }),
  z.object({ status: z.literal('pending'), reason: z.enum(['in-flight', 'deadline', 'storage-unconfirmed']) }),
  z.object({ status: z.literal('failed'), reason: z.literal('capture-error') }),
]);

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
    const result = await apiRequest<{ enabled?: boolean; scheduled?: boolean; status?: unknown; reason?: unknown }>(
      request,
      `/projects/${params.projectId}/thumbnail/refresh`,
      {
        method: 'POST',
        body: JSON.stringify({ url }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(28_000)]),
      },
    );

    const parsed = captureResultSchema.safeParse(result);

    if (!parsed.success) {
      // Older API replicas only acknowledge scheduling; that is not proof of a write.
      return json({
        ok: true,
        enabled: result?.enabled !== false,
        ...(result?.enabled === false
          ? { status: 'skipped', reason: DISABLED_REASON }
          : { status: 'pending', reason: DEADLINE_REASON }),
      });
    }

    return json({ ok: true, enabled: result?.enabled !== false, ...parsed.data });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return json({ ok: true, enabled: true, status: 'pending', reason: DEADLINE_REASON }, { status: 202 });
    }

    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    if (status === 404) {
      return json({ ok: false, enabled: false }, { status: 404 });
    }

    return remainingApiErrorResponse(request, 'THUMBNAIL_REFRESH_FAILED', status, { extra: { ok: false } });
  }
}
