import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * RPL-IDE-001.7 — IDE proxy for the Resources panel's RAM / CPU / Storage.
 *
 * Forwards to the internal API's `/api/runtime/workspaces/:id/resources`, which
 * runs `authorizeRuntimeWorkspace(..., 'workspaces:read')` before touching the
 * agent. The workspace id arrives as a query parameter because the IDE already
 * holds the id of the workspace it is attached to; a forged id is rejected by
 * that authorization, not trusted here.
 *
 * A workspace that is asleep, starting, or simply cannot be measured answers
 * 503 upstream. That is surfaced as-is rather than smoothed into zeroes — the
 * panel has to be able to say "not available" instead of drawing an empty bar
 * that reads like a measurement of nothing.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const workspaceId = new URL(request.url).searchParams.get('workspaceId');

  if (!workspaceId) {
    return remainingApiErrorResponse(request, 'WORKSPACE_NOT_FOUND', 400, { extra: { ok: false } });
  }

  try {
    const payload = await apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/resources`);

    return json({ ok: true, resources: payload });
  } catch (error) {
    const status = (error as { status?: number } | undefined)?.status;

    return json(
      {
        ok: false,
        code: 'WORKSPACE_RESOURCES_UNAVAILABLE',
        resources: null,
      },
      { status: status && status >= 400 && status < 600 ? status : 503 },
    );
  }
}
