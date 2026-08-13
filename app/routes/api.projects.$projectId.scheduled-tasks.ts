/*
 * Scheduled tasks (cron) — the browser-facing route for the 4th deployment type.
 *
 * Thin proxy over the api's /projects/:id/scheduled-tasks surface, which owns the
 * real executor (services/api/src/scheduled-tasks.ts): the cron is claimed by the
 * api's scheduler tick, the command runs in the project's own sandbox, and every
 * run is persisted with its exit code, duration, full logs and billed compute.
 *
 * The panel talks to this route; it never talks to the api directly (the session
 * cookie is exchanged for the api call by `apiRequest`).
 */
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = String(params.projectId);
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');
  const runId = url.searchParams.get('runId');

  // One run, with its FULL logs.
  if (taskId && runId) {
    return json(await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${taskId}/runs/${runId}`));
  }

  // The run history of one task (summaries; logs are fetched per run).
  if (taskId) {
    return json(await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${taskId}/runs`));
  }

  return json(await apiRequest(request, `/projects/${projectId}/scheduled-tasks`));
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = String(params.projectId);

  /*
   * The panel posts a <form>; scripted callers post JSON. Accept both rather than
   * 500-ing on a body shape (the same fix already applied to the ide-panel route).
   */
  const contentType = request.headers.get('content-type') ?? '';

  const body: Record<string, unknown> = contentType.includes('application/json')
    ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
    : (formObject(await request.formData()) as Record<string, unknown>);

  const intent = String(body.intent ?? '');
  const taskId = body.taskId ? String(body.taskId) : '';

  if (intent === 'create') {
    const created = await apiRequest(request, `/projects/${projectId}/scheduled-tasks`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'DEPLOYMENT',
        name: String(body.name ?? 'Scheduled job'),
        command: String(body.command ?? ''),
        cron: String(body.cron ?? ''),
        timezone: String(body.timezone ?? 'UTC'),

        // The size CATALOGUE is owned elsewhere; this route only carries the field.
        machineSize: String(body.machineSize ?? 'shared-0.5'),
        enabled: body.enabled !== 'false',
        ...(body.timeoutSeconds ? { timeoutSeconds: Number(body.timeoutSeconds) } : {}),
        ...(body.concurrency ? { concurrency: String(body.concurrency) } : {}),
        ...(body.maxRetries ? { maxRetries: Number(body.maxRetries) } : {}),
      }),
    });

    return json(created);
  }

  if (intent === 'update' && taskId) {
    const patch: Record<string, unknown> = {};

    for (const key of ['name', 'command', 'cron', 'timezone', 'machineSize', 'concurrency'] as const) {
      if (body[key] !== undefined) {
        patch[key] = String(body[key]);
      }
    }

    if (body.enabled !== undefined) {
      patch.enabled = body.enabled !== 'false';
    }

    if (body.timeoutSeconds !== undefined) {
      patch.timeoutSeconds = Number(body.timeoutSeconds);
    }

    if (body.maxRetries !== undefined) {
      patch.maxRetries = Number(body.maxRetries);
    }

    return json(
      await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    );
  }

  if (intent === 'delete' && taskId) {
    await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${taskId}`, { method: 'DELETE' });

    return json({ ok: true });
  }

  // "Run now": the same executor as a cron tick, so it lands in the same history.
  if (intent === 'run' && taskId) {
    return json(await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${taskId}/run`, { method: 'POST' }));
  }

  if (intent === 'cancel-run' && taskId && body.runId) {
    return json(
      await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${taskId}/runs/${String(body.runId)}/cancel`, {
        method: 'POST',
      }),
    );
  }

  // Validate a cron + preview its next fire time, without persisting anything.
  if (intent === 'preview') {
    return json(
      await apiRequest(request, `/scheduled-tasks/preview`, {
        method: 'POST',
        body: JSON.stringify({ cron: String(body.cron ?? ''), timezone: String(body.timezone ?? 'UTC') }),
      }),
    );
  }

  throw json({ error: `Unsupported intent: ${intent || '(none)'}` }, { status: 400 });
}
