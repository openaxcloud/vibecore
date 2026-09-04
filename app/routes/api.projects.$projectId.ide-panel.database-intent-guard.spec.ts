import { afterEach, describe, expect, it, vi } from 'vitest';

import { toResponse } from '~/lib/test/rr7-data';

/*
 * R-8 — the database panel had a fallthrough `else` that WROTE an env var.
 *
 * `PUT /projects/:id/env-vars { key: body.key || 'DATABASE_URL', value: body.value ?? '' }`
 * ran for ANY intent the branch did not recognise. No caller reached it today —
 * measured with a fixed-string sweep of `app/`, after a quoted-pattern search
 * missed the JSX `value="…"` forms and under-reported the emitters. But an
 * unreachable write path is still a loaded gun: the first future intent added to
 * a database form without a matching branch would have blanked the project's
 * connection string, with `ok: true` in the response.
 *
 * These tests pin the fail-closed behaviour AND the three intents that are
 * really wired, so "fail closed" can never quietly become "fail on everything".
 */
const apiRequest = vi.fn();

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequest(...args),
  };
});

function actionArgs(fields: Record<string, string>, projectId = 'proj-42') {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  return {
    request: new Request(`https://app.test/api/projects/${projectId}/ide-panel/database`, {
      method: 'POST',
      body: form,
    }),
    params: { projectId, panel: 'database' },
  } as any;
}

/** Upstream writes performed by the action, as `METHOD url` + parsed body. */
function writes(): Array<{ method: string; url: string; body: any }> {
  return apiRequest.mock.calls
    .filter((call) => call[2] && call[2].method && call[2].method !== 'GET')
    .map((call) => ({
      method: String(call[2].method),
      url: String(call[1]),
      body: call[2].body ? JSON.parse(String(call[2].body)) : undefined,
    }));
}

async function run(fields: Record<string, string>) {
  const { action } = await import('./api.projects.$projectId.ide-panel.$panel');

  return toResponse(await action(actionArgs(fields))) as Response;
}

describe('database panel refuses intents it does not implement', () => {
  afterEach(() => {
    apiRequest.mockReset();
  });

  it('answers 400 instead of writing an env var for an unknown intent', async () => {
    apiRequest.mockResolvedValue({});

    const response = await run({ intent: 'not-a-real-intent' });

    expect(response.status).toBe(400);
    expect(((await response.json()) as any).code).toBe('DATABASE_INTENT_UNSUPPORTED');
    expect(writes().filter((write) => write.url.endsWith('/env-vars'))).toEqual([]);
  });

  /**
   * The specific catastrophe the old fallthrough enabled: an intent carrying no
   * key and no value blanked DATABASE_URL and reported success.
   */
  it('never blanks DATABASE_URL through a fallthrough', async () => {
    apiRequest.mockResolvedValue({});

    await run({ intent: 'whatever' });

    const blanking = writes().filter(
      (write) => write.url.endsWith('/env-vars') && write.body?.key === 'DATABASE_URL' && !write.body?.value,
    );

    expect(blanking).toEqual([]);
  });

  it('no longer accepts delete-env, which only ever belonged to the Terminal panel', async () => {
    apiRequest.mockResolvedValue({});

    const response = await run({ intent: 'delete-env', key: 'API_URL' });

    expect(response.status).toBe(400);
    expect(writes().filter((write) => write.url.endsWith('/env-vars'))).toEqual([]);
  });

  /**
   * Counter-proof (méthode, règle 6). Failing closed is only correct if the
   * intents that ARE wired still work — otherwise this is a panel that stopped
   * doing its job and the assertions above would still pass.
   */
  it('still performs the three intents that are really wired', async () => {
    apiRequest.mockResolvedValue({});
    await run({ intent: 'upsert-secret', key: 'DATABASE_URL', value: 'postgres://x' });

    const secretWrites = writes().filter((write) => write.url.endsWith('/secrets'));

    expect(secretWrites).toHaveLength(1);
    expect(secretWrites[0].method).toBe('PUT');

    apiRequest.mockReset();
    apiRequest.mockResolvedValue({});
    await run({ intent: 'provision', environment: 'development' });

    expect(writes().filter((write) => write.url.endsWith('/database/provision'))).toHaveLength(1);

    apiRequest.mockReset();
    apiRequest.mockResolvedValue({});
    await run({ intent: 'query', query: 'select 1' });

    expect(writes().filter((write) => write.url.endsWith('/databases/query'))).toHaveLength(1);
  });
});
