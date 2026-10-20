import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestApi = vi.hoisted(() => vi.fn());
vi.mock('~/lib/enterprise-api.server', async (original) => ({
  ...(await original<typeof import('~/lib/enterprise-api.server')>()),
  apiRequest: requestApi,
}));
import { action } from './api.projects.$projectId.database';
import { action as pageAction, loader as pageLoader } from './projects.$projectId.database';

beforeEach(() => {
  requestApi.mockReset();
});

describe('database restoration proxy refusal', () => {
  it('forwards capability through the standalone page loader', async () => {
    requestApi.mockImplementation(async (_request, path: string) => {
      if (path.endsWith('/recovery-points')) {
        return { recoveryPoints: [], window: null };
      }

      if (path.endsWith('/database')) {
        return {
          entitlement: { allowed: true, retentionDays: 28 },
          instance: null,
          restores: [],
          snapshots: [],
          restoreCapability: { available: false, reason: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE' },
        };
      }

      return { project: { id: 'p1' } };
    });

    const result = await pageLoader({
      request: new Request('http://localhost/projects/p1/database'),
      params: { projectId: 'p1' },
      context: {},
    } as Parameters<typeof pageLoader>[0]);
    expect(result.data.restoreCapability).toEqual({
      available: false,
      reason: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE',
    });
    expect(result.data.window).toBeNull();
  });

  it('preserves the refusal on a stale standalone restore form', async () => {
    requestApi.mockRejectedValue(
      new Response(JSON.stringify({ code: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE', error: 'private detail' }), {
        status: 503,
      }),
    );

    const result = await pageAction({
      request: new Request('http://localhost/projects/p1/database?lang=fr', {
        method: 'POST',
        body: new URLSearchParams({ intent: 'restore', snapshotId: 'snap1' }),
      }),
      params: { projectId: 'p1' },
      context: {},
    } as Parameters<typeof pageAction>[0]);
    expect(result.init?.status).toBe(503);
    expect(result.data).toMatchObject({ ok: false, code: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE' });
    expect(JSON.stringify(result.data)).toContain('Aucune restauration n’a été lancée');
    expect(JSON.stringify(result.data)).not.toContain('private detail');
  });

  it('preserves the known refusal code with localized copy and no upstream details', async () => {
    requestApi.mockRejectedValue(
      new Response(
        JSON.stringify({
          code: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE',
          error: 'private provider detail',
        }),
        { status: 503 },
      ),
    );

    const response = await action({
      request: new Request('http://localhost/api/projects/p1/database', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept-language': 'fr' },
        body: JSON.stringify({
          intent: 'restore',
          environment: 'production',
          targetTimestamp: '2026-10-18T00:00:00.000Z',
        }),
      }),
      params: { projectId: 'p1' },
      context: {},
    } as Parameters<typeof action>[0]);
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code: 'RESTORE_APPLICATION_CUTOVER_UNAVAILABLE' });
    expect(body.error).toContain('Aucune restauration n’a été lancée');
    expect(JSON.stringify(body)).not.toContain('private provider detail');
    expect(JSON.parse(requestApi.mock.calls[0][2].body).environment).toBe('production');
  });

  it('does not reflect unknown upstream failures or private details', async () => {
    requestApi.mockRejectedValue(
      new Response(JSON.stringify({ code: 'PRIVATE_PROVIDER_CODE', error: 'private detail' }), { status: 503 }),
    );

    const response = await action({
      request: new Request('http://localhost/api/projects/p1/database', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      params: { projectId: 'p1' },
      context: {},
    } as Parameters<typeof action>[0]);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/PRIVATE_PROVIDER_CODE|private detail/);
  });
});
