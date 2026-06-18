import {
  apiErrorMessage,
  apiRequest,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

/*
 * Replit-parity database point-in-time rollback — web proxy for the project
 * database panel. Forwards to the backend `/projects/:id/database` (GET) and
 * `/projects/:id/database/restores` (POST). The backend 404s with
 * FEATURE_NOT_ENABLED until DB_ROLLBACK_ENABLED is on, which the dormant UI
 * shell treats as "not available" — so this is inert until the feature ships.
 */

interface DatabaseRollbackEntitlement {
  allowed: boolean;
  retentionDays: number;
}

interface DatabasePanelResponse {
  entitlement: DatabaseRollbackEntitlement;
  instance: {
    id: string;
    status: string;
    engine: string;
    sizeBytes: number;
    retentionDays: number;
    pitrEnabled: boolean;
  } | null;
  snapshots: Array<{ id: string; kind: string; label?: string; sizeBytes: number; createdAt: string }>;
  restores: Array<{ id: string; status: string; targetTimestamp?: string; createdAt: string }>;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  try {
    const payload = await apiRequest<DatabasePanelResponse>(
      request,
      `/projects/${encodeURIComponent(projectId)}/database`,
    );

    return json({ ok: true, ...payload }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    /*
     * FEATURE_NOT_ENABLED surfaces as a 404 — pass it through so the shell can
     * render its dormant "not available" state instead of an error.
     */
    if (error instanceof Response && error.status === 404) {
      return json({ ok: false, enabled: false }, { status: 404 });
    }

    const message = await apiErrorMessage(error, 'Database panel unavailable');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw json({ ok: false, error: message }, { status });
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { intent?: string; [key: string]: unknown };
  const intent = body.intent ?? 'restore';

  // Map the panel's intent to the backend sub-route. All are flag-gated server-side.
  const path =
    intent === 'provision'
      ? `/projects/${encodeURIComponent(projectId)}/database/provision`
      : intent === 'snapshot'
        ? `/projects/${encodeURIComponent(projectId)}/database/snapshots`
        : `/projects/${encodeURIComponent(projectId)}/database/restores`;

  const { intent: _intent, ...forward } = body;

  try {
    const payload = await apiRequest(request, path, { method: 'POST', body: JSON.stringify(forward) });

    return json({ ok: true, intent, ...(payload as Record<string, unknown>) });
  } catch (error) {
    const message = await apiErrorMessage(error, 'Database request failed');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    /* Return (not throw) so the fetcher receives the error in fetcher.data and the panel can surface it. */
    return json({ ok: false, error: message, status }, { status });
  }
}
