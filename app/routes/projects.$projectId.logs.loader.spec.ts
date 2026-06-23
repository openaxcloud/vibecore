import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * apiRequest is mocked at the module boundary so the logs loader can be exercised
 * without a live enterprise backend.
 *
 * The loader makes (in order):
 *   1. GET /projects/:id                                          -> { project }
 *   2. GET /projects/:id/dashboard                                -> dashboard (incl. workspace)
 *   3. GET /api/runtime/workspaces/:wsId/logs/snapshot            -> RuntimeLogsSnapshot
 *
 * Call (3) is wrapped in a `.catch`. The regression under test: that catch used
 * to swallow EVERYTHING, including the re-auth redirect Response (3xx) that
 * apiRequest throws on an expired session / MFA-required during a page
 * navigation, turning a needed /login redirect into a dead-end inline
 * "Unable to load runtime logs" banner. The fix re-throws redirect (3xx) and
 * server (5xx) Responses while still degrading genuine non-redirect failures.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function loaderArgs(projectId = 'proj-1') {
  return {
    request: new Request(`https://app.test/projects/${projectId}/logs`),
    params: { projectId },
  } as any;
}

/** Mirrors the real Response apiRequest throws on a non-2xx upstream status. */
function apiErrorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Mirrors the re-auth redirect Response apiRequest throws on an expired session / MFA. */
function reauthRedirect(location = '/login'): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/** First two apiRequest calls resolve to a project + a dashboard carrying a live workspace. */
function mockProjectAndWorkspace(): void {
  apiRequest
    .mockResolvedValueOnce({ project: { id: 'proj-1' } })
    .mockResolvedValueOnce({ workspace: { id: 'ws-1', status: 'RUNNING' } });
}

/*
 * The loader returns RR7's data() sentinel (aliased `json` in
 * enterprise-api.server), whose payload lives on `.data`. The loader's payload
 * is itself `{ project, data: { ...dashboard, runtimeLogs } }`, so the dashboard
 * page state (incl. runtimeLogs) is at `result.data.data`.
 */
function readPageData(result: any): any {
  const payload = result && typeof result === 'object' && 'data' in result ? result.data : result;

  return payload?.data ?? payload;
}

describe('projects logs loader re-auth propagation', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('re-throws the re-auth redirect Response instead of degrading it into a log banner', async () => {
    mockProjectAndWorkspace();
    apiRequest.mockRejectedValueOnce(reauthRedirect('/login'));

    const { loader } = await import('./projects.$projectId.logs');

    const thrown = await loader(loaderArgs()).then(
      () => null,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('location')).toBe('/login');
  });

  it('re-throws 5xx server Responses instead of degrading them', async () => {
    mockProjectAndWorkspace();
    apiRequest.mockRejectedValueOnce(apiErrorResponse(503, 'runtime unavailable'));

    const { loader } = await import('./projects.$projectId.logs');

    const thrown = await loader(loaderArgs()).then(
      () => null,
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(503);
  });

  it('degrades a genuine non-redirect Error into an inline runtimeLogs error', async () => {
    mockProjectAndWorkspace();
    apiRequest.mockRejectedValueOnce(new Error('snapshot buffer empty'));

    const { loader } = await import('./projects.$projectId.logs');

    const data = readPageData(await loader(loaderArgs()));

    expect(data.runtimeLogs).toEqual({ logs: [], error: 'snapshot buffer empty' });
  });

  it('returns the snapshot logs on success', async () => {
    mockProjectAndWorkspace();
    apiRequest.mockResolvedValueOnce({ logs: [{ level: 'info', message: 'listening on 3000' }] });

    const { loader } = await import('./projects.$projectId.logs');

    const data = readPageData(await loader(loaderArgs()));

    expect(data.runtimeLogs).toEqual({ logs: [{ level: 'info', message: 'listening on 3000' }] });
  });
});
