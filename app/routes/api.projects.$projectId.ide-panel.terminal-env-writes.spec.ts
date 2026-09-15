import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * R-2 — the Terminal panel must never write environment variables again.
 *
 * Its "Environment" tab used to carry a SECOND env/secrets CRUD, writing the
 * same `/projects/:id/env-vars` and `/projects/:id/secrets` endpoints as the
 * dedicated Env vars and Secrets tools. Two implementations of one screen — and
 * they did not agree:
 *
 *   - the `env` panel sends a `scope` (production / preview / development);
 *   - the terminal panel sent NONE, and `prisma-store.upsertProjectEnvVar` /
 *     `deleteProjectEnvVar` default an omitted scope to production.
 *
 * Since `GET /projects/:id/env-vars` returns every scope with no filter, the
 * terminal tab listed variables of all scopes undifferentiated and then wrote
 * and deleted only the production row. Deleting a preview-scoped `API_URL`
 * from there removed the PRODUCTION one — or nothing at all, leaving the
 * clicked row on screen.
 *
 * These tests are the discriminating pair: same intent, two panels, and only
 * the panel that owns the screen is allowed to write.
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function actionArgs(panel: string, fields: Record<string, string>, projectId = 'proj-42') {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/${panel}`, {
      method: 'POST',
      body: form,
    }),
    params: { projectId, panel },
  } as any;
}

/**
 * The terminal panel legitimately persists its OWN state (SSH connections,
 * script runs) in a reserved env var. That write is not a user env var and must
 * not be confused with one — measured, not assumed: filtering only on the
 * `/env-vars` URL made this guard fail on the panel's own bookkeeping.
 */
const TERMINAL_STATE_ENV_KEY = 'VIBECORE_TERMINAL_STATE';

/** Writes that touch a USER-owned env var or secret, excluding panel bookkeeping. */
function userEnvWrites(): Array<{ method: string; url: string; body: any }> {
  return writes().filter(
    (write) =>
      (write.url.endsWith('/env-vars') || write.url.endsWith('/secrets')) && write.body?.key !== TERMINAL_STATE_ENV_KEY,
  );
}

/** Every upstream write this action performed, as `METHOD url` + parsed body. */
function writes(): Array<{ method: string; url: string; body: any }> {
  return apiRequest.mock.calls
    .filter((call) => call[2] && call[2].method && call[2].method !== 'GET')
    .map((call) => ({
      method: String(call[2].method),
      url: String(call[1]),
      body: call[2].body ? JSON.parse(String(call[2].body)) : undefined,
    }));
}

describe('ide-panel env writes belong to the env panel, not the terminal', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('writes the env var WITH its scope when the env panel asks', async () => {
    apiRequest.mockResolvedValue({});

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs('env', { intent: 'upsert', key: 'API_URL', value: 'https://a', scope: 'preview' }));

    const envWrites = writes().filter((write) => write.url.endsWith('/env-vars'));

    expect(envWrites).toHaveLength(1);
    expect(envWrites[0].method).toBe('PUT');
    expect(envWrites[0].body).toEqual({ key: 'API_URL', value: 'https://a', scope: 'preview' });
  });

  it('deletes the env var WITH its scope when the env panel asks', async () => {
    apiRequest.mockResolvedValue({});

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs('env', { intent: 'delete', key: 'API_URL', scope: 'preview' }));

    const envWrites = writes().filter((write) => write.url.endsWith('/env-vars'));

    expect(envWrites).toHaveLength(1);
    expect(envWrites[0].method).toBe('DELETE');
    expect(envWrites[0].body).toEqual({ key: 'API_URL', scope: 'preview' });
  });

  /**
   * THE guard. `add-env` was the scope-less writer; it must now do nothing at
   * all on this panel. A future change that re-adds it — the obvious thing to
   * do if someone re-implements the tab's own forms — turns this red.
   */
  it('performs NO env-var write when the terminal panel is asked to add one', async () => {
    apiRequest.mockResolvedValue({});

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs('terminal', { intent: 'add-env', key: 'API_URL', value: 'https://a' }));

    expect(userEnvWrites()).toEqual([]);
  });

  it('performs NO env-var or secret delete when the terminal panel is asked to delete one', async () => {
    apiRequest.mockResolvedValue({});

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs('terminal', { intent: 'delete-env', key: 'API_URL', isSecret: 'false' }));
    await action(actionArgs('terminal', { intent: 'delete-env', key: 'TOKEN', isSecret: 'true' }));

    expect(userEnvWrites()).toEqual([]);
  });

  /**
   * Counter-proof for the filter itself (méthode, règle 14): `userEnvWrites`
   * must not be blind. If it silently matched nothing, every assertion above
   * would pass on a panel that still writes user variables.
   */
  it('would still SEE a user env write if the terminal panel made one', async () => {
    apiRequest.mockResolvedValue({});

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs('env', { intent: 'upsert', key: 'API_URL', value: 'https://a', scope: 'preview' }));

    expect(userEnvWrites()).toHaveLength(1);
    expect(userEnvWrites()[0].body.key).toBe('API_URL');
  });

  /**
   * Counter-proof (méthode, règle 6). Removing a writer is only correct if the
   * terminal's OTHER intents still work — otherwise this "fix" is just a panel
   * that stopped doing its job, and the tests above would pass on a broken one.
   */
  it('still runs the terminal intents that are genuinely its own', async () => {
    apiRequest.mockResolvedValue({});

    const { action } = await import('./api.projects.$projectId.ide-panel.$panel');
    await action(actionArgs('terminal', { intent: 'add-ssh', host: 'git.example.com', username: 'git' }));

    expect(writes().length).toBeGreaterThan(0);
  });
});
