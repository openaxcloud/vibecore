import { randomUUID } from 'node:crypto';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse, remainingApiRouteMessage } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404);
  }

  const url = new URL(request.url);

  if (url.searchParams.get('intent') === 'remix-policy') {
    try {
      const contract = await apiRequest<{
        policies: Array<'DETACH' | 'CLONE' | 'SHARE_WITH_CONSENT'>;
        storageConsentVersion: string;
      }>(request, `/projects/${projectId}/remix-policy`);

      return json({ ok: true, ...contract });
    } catch (error) {
      const status = error instanceof Response && error.status !== 500 ? error.status : 502;

      return remainingApiErrorResponse(
        request,
        status === 401 || status === 403 ? 'PROJECT_ACTION_AUTH_REQUIRED' : 'PROJECT_ACTION_FAILED',
        status,
        { extra: { ok: false } },
      );
    }
  }

  if (url.searchParams.get('intent') !== 'export') {
    throw remainingApiErrorResponse(request, 'PROJECT_ACTION_UNSUPPORTED', 404);
  }

  let exported: { archive?: { base64?: string; storageKey?: string; byteLength?: number } };

  try {
    exported = await apiRequest<{ archive?: { base64?: string; storageKey?: string; byteLength?: number } }>(
      request,
      `/projects/${projectId}/export/zip`,
    );
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw remainingApiErrorResponse(
      request,
      status === 401 || status === 403 ? 'PROJECT_EXPORT_AUTH_REQUIRED' : 'PROJECT_EXPORT_UNAVAILABLE',
      status,
      { extra: { ok: false } },
    );
  }

  const base64 = exported.archive?.base64;

  if (!base64) {
    throw remainingApiErrorResponse(request, 'PROJECT_EXPORT_ARCHIVE_MISSING', 502);
  }

  let bytes: Uint8Array;

  try {
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    throw remainingApiErrorResponse(request, 'PROJECT_EXPORT_ARCHIVE_CORRUPT', 502);
  }

  return new Response(bytes, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${projectId}.zip"`,
      'content-length': String(exported.archive?.byteLength ?? bytes.byteLength),
    },
  });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404);
  }

  const body = formObject(await request.formData()) as Record<string, string>;
  const intent = body.intent;

  /*
   * Mutation failures are RETURNED (not thrown) so useFetcher callers get
   * `{ ok: false, error }` in fetcher.data and can toast it, instead of
   * tripping the route ErrorBoundary.
   */
  try {
    if (intent === 'duplicate') {
      const suffix = remainingApiRouteMessage(request, 'projectCopySuffix');
      const fallbackName = remainingApiRouteMessage(request, 'projectFallbackName');

      const duplicated = await apiRequest(request, `/projects/${projectId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ name: body.name || `${body.projectName || fallbackName} ${suffix}` }),
      });

      return json({ ok: true, project: duplicated });
    }

    if (intent === 'fork') {
      const suffix = remainingApiRouteMessage(request, 'projectForkSuffix');
      const fallbackName = remainingApiRouteMessage(request, 'projectFallbackName');
      const idempotencyKey = body.idempotencyKey || randomUUID();

      const supportedStoragePolicies = ['DETACH', 'CLONE', 'SHARE_WITH_CONSENT'] as const;

      if (
        body.storagePolicy &&
        !supportedStoragePolicies.includes(body.storagePolicy as (typeof supportedStoragePolicies)[number])
      ) {
        return remainingApiErrorResponse(request, 'PROJECT_REMIX_STORAGE_POLICY_INVALID', 400, {
          extra: { ok: false },
        });
      }

      const storagePolicy = body.storagePolicy || 'DETACH';

      const remixed = await apiRequest<{
        project: { id: string; slug?: string } | null;
        remix: { id?: string; remixJobId?: string; state: string };
        retryAfterMs?: number;
      }>(request, `/projects/${projectId}/remix`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          name: body.name || `${body.projectName || fallbackName} ${suffix}`,
          storagePolicy,
          idempotencyKey,
          ...(storagePolicy === 'SHARE_WITH_CONSENT' && body.storageConsentVersion
            ? {
                storageConsent: {
                  granted: true,
                  version: body.storageConsentVersion,
                },
              }
            : {}),
        }),
      });

      return json({
        ok: true,
        project: remixed.project,
        remix: remixed.remix,
        pending: remixed.project === null,
        retryAfterMs: remixed.retryAfterMs,
        idempotencyKey,
      });
    }

    /*
     * 'delete' predates the Archive/Delete split and is kept as an alias of the
     * soft-delete for existing callers; 'archive' is the card-menu intent.
     */
    if (intent === 'delete' || intent === 'archive') {
      await apiRequest(request, `/projects/${projectId}`, { method: 'DELETE' });

      return json({ ok: true });
    }

    if (intent === 'unarchive') {
      await apiRequest(request, `/projects/${projectId}/restore`, { method: 'POST' });

      return json({ ok: true });
    }

    if (intent === 'delete-permanent') {
      /*
       * F13: forward the typed name confirmation so the API can re-verify it
       * server-side (defense-in-depth) before the irreversible hard delete.
       */
      await apiRequest(request, `/projects/${projectId}/permanent`, {
        method: 'DELETE',
        ...(body.confirmName ? { body: JSON.stringify({ confirmName: body.confirmName }) } : {}),
      });

      return json({ ok: true });
    }

    if (intent === 'rename') {
      await apiRequest(request, `/projects/${projectId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ name: body.name }),
      });

      return json({ ok: true });
    }
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    return remainingApiErrorResponse(
      request,
      status === 401 || status === 403 ? 'PROJECT_ACTION_AUTH_REQUIRED' : 'PROJECT_ACTION_FAILED',
      status,
      { extra: { ok: false } },
    );
  }

  throw remainingApiErrorResponse(request, 'PROJECT_ACTION_UNSUPPORTED', 404);
}
