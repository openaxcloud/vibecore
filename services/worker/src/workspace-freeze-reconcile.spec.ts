/*
 * RR-CODEX-14 v7 (R-P3-07) — the freeze-reconcile job must be AUTHENTICATED and must
 * never report a sweep it did not actually run.
 *
 * Context: the manager's /internal/reconcile-workspace-freezes existed with no caller
 * at all, so orphaned purge barriers were only ever reclaimed by a hand-rolled curl —
 * which is also why nobody noticed the endpoint had no authentication. This job is
 * that caller. It sends the dedicated control-plane secret, and a network error or any
 * non-2xx has to surface as a FAILED job so a permanently broken sweep is visible
 * instead of looking like "nothing to reconcile".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_URL = process.env.WORKSPACE_MANAGER_URL;
const ORIGINAL_SECRET = process.env.WORKSPACE_MANAGER_SHARED_SECRET;

function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    process.env[key] = original;
  }
}

afterEach(() => {
  restoreEnv('WORKSPACE_MANAGER_URL', ORIGINAL_URL);
  restoreEnv('WORKSPACE_MANAGER_SHARED_SECRET', ORIGINAL_SECRET);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  delete (process.env as Record<string, string | undefined>).WORKSPACE_MANAGER_URL;
  delete (process.env as Record<string, string | undefined>).WORKSPACE_MANAGER_SHARED_SECRET;
});

describe('triggerWorkspaceFreezeReconcile', () => {
  it('throws when WORKSPACE_MANAGER_URL is missing so the CronJob fails loudly', async () => {
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'secret';

    const { triggerWorkspaceFreezeReconcile } = await import('./index.js');
    await expect(triggerWorkspaceFreezeReconcile({})).rejects.toThrowError(/WORKSPACE_MANAGER_URL is required/);
  });

  /*
   * Without the secret the request would 401 and the sweep would silently never run.
   * Fail here instead — a misconfigured secret is an outage of the reconciler, and it
   * must not be discoverable only by noticing barriers piling up.
   */
  it('throws when the control-plane secret is missing rather than sending an unauthenticated call', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceFreezeReconcile } = await import('./index.js');
    await expect(triggerWorkspaceFreezeReconcile({})).rejects.toThrowError(
      /WORKSPACE_MANAGER_SHARED_SECRET is required/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs with the bearer secret and returns the manager counts', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'manager-secret';

    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ scanned: 3, reconciled: 1, skippedLiveOwner: 2, failed: 0 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceFreezeReconcile } = await import('./index.js');
    const result = await triggerWorkspaceFreezeReconcile({});

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wsm.test:3010/internal/reconcile-workspace-freezes');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer manager-secret');
    expect(result).toEqual({ scanned: 3, reconciled: 1, skippedLiveOwner: 2, failed: 0 });
  });

  it('forwards an explicit graceMs and otherwise lets the manager default apply', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'manager-secret';

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerWorkspaceFreezeReconcile } = await import('./index.js');

    await triggerWorkspaceFreezeReconcile({ graceMs: 7_200_000 });
    expect(JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ graceMs: 7_200_000 });

    await triggerWorkspaceFreezeReconcile({});
    expect(JSON.parse((fetchSpy.mock.calls[1]![1] as RequestInit).body as string)).toEqual({});
  });

  /*
   * The core of reserve #4: a refusal is not a successful sweep. A 401 (bad secret) or
   * a 400 (bad graceMs) has to fail the job, or the cron would report success while no
   * barrier was ever reconciled.
   */
  it.each([401, 403, 400, 500, 503])('throws on a non-2xx (%i) instead of reporting success', async (status) => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'manager-secret';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status })),
    );

    const { triggerWorkspaceFreezeReconcile } = await import('./index.js');
    await expect(triggerWorkspaceFreezeReconcile({})).rejects.toThrowError(
      new RegExp(`workspace.freezeReconcile upstream failed: ${status}`),
    );
  });

  it('propagates a network error rather than swallowing it', async () => {
    process.env.WORKSPACE_MANAGER_URL = 'http://wsm.test:3010';
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'manager-secret';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const { triggerWorkspaceFreezeReconcile } = await import('./index.js');
    await expect(triggerWorkspaceFreezeReconcile({})).rejects.toThrowError(/ECONNREFUSED/);
  });
});
