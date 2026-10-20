import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from './api.projects.$projectId.ide-panel.$panel';

/*
 * Real BFF and apiRequest transport; loopback API state is an explicit fixture.
 * No provider, client data, database, credential validation or production proof.
 */
let server: Server;
let state: Record<string, unknown>;
let calls: Array<{ path: string; method: string }>;
let denyRead: boolean;

const originalFetch = globalThis.fetch;

const initial = {
  integrations: { github: { connected: true, status: 'error', lastSync: '2020-01-01T00:00:00.000Z' } },
  webhooks: [],
  apiKeys: [],
  eventStreams: [],
};

beforeEach(async () => {
  state = structuredClone(initial);
  calls = [];
  denyRead = false;
  server = createServer(async (request, response) => {
    const path = request.url ?? '';
    const method = request.method ?? 'GET';
    calls.push({ path, method });
    response.setHeader('content-type', 'application/json');

    if (path === '/projects/proj-fixture/env-vars') {
      if (method === 'GET') {
        if (denyRead) {
          response.writeHead(403).end(JSON.stringify({ error: 'Forbidden' }));
        } else {
          response.end(
            JSON.stringify({ envVars: [{ key: 'VIBECORE_INTEGRATIONS_STATE', value: JSON.stringify(state) }] }),
          );
        }

        return;
      }

      if (method === 'PUT') {
        let body = '';

        for await (const chunk of request) {
          body += String(chunk);
        }
        state = JSON.parse(JSON.parse(body).value);
        response.end('{}');

        return;
      }
    }

    if (method === 'GET') {
      response.end(JSON.stringify(path === '/projects/proj-fixture' ? { project: { id: 'proj-fixture' } } : {}));
      return;
    }

    response.writeHead(500).end(JSON.stringify({ error: 'Unexpected fixture mutation' }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing loopback address');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  vi.stubEnv('SAAS_API_URL', origin);
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.origin !== origin) {
      throw new Error('External HTTP forbidden');
    }

    return originalFetch(input, init);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await new Promise<void>((done) => {
    server.close(() => done());
    server.closeAllConnections();
  });
  expect(server.listening).toBe(false);
});

function args(language: string, fields?: Record<string, string>, jsonBody = false) {
  return {
    request: new Request('http://app.local/api/projects/proj-fixture/ide-panel/integrations', {
      method: fields ? 'POST' : 'GET',
      headers: {
        cookie: `vc_session=fixture-not-a-real-credential; ecode_lang=${language}`,
        'accept-language': language,
        ...(fields ? { 'content-type': jsonBody ? 'application/json' : 'application/x-www-form-urlencoded' } : {}),
      },
      ...(fields ? { body: jsonBody ? JSON.stringify(fields) : new URLSearchParams(fields) } : {}),
    }),
    params: { projectId: 'proj-fixture', panel: 'integrations' },
    context: {},
  };
}

function unpack(value: unknown) {
  return value as { data: Record<string, any>; init?: { status?: number; headers?: Headers } };
}

for (const language of ['en', 'fr']) {
  describe(`integration Sync ${language}`, () => {
    for (const jsonBody of [false, true]) {
      it(`rejects ${jsonBody ? 'JSON' : 'form'} Sync before any write and preserves existing state`, async () => {
        const result = unpack(await action(args(language, { intent: 'sync', integrationId: 'github' }, jsonBody)));
        expect(result.init?.status).toBe(503);
        expect(result.data).toMatchObject({ ok: false, code: 'INTEGRATION_SYNC_UNAVAILABLE' });
        expect(result.data.error).toMatch(language === 'fr' ? /synchronisation.*indisponible/i : /sync.*unavailable/i);
        expect(result.data.error).not.toMatch(/retry|réessay/i);
        expect(calls).toEqual([{ path: '/projects/proj-fixture/env-vars', method: 'GET' }]);
        expect(state).toEqual(initial);
      });
    }
    it('exposes an unavailable capability without rewriting historical records', async () => {
      const result = unpack(await loader(args(language)));
      expect(result.data.data.integrationSync).toEqual({ available: false, code: 'INTEGRATION_SYNC_UNAVAILABLE' });
      expect(result.data.data.integrationsState).toEqual(initial);
      expect(state).toEqual(initial);
      expect(calls.every((call) => call.method === 'GET')).toBe(true);
    });
  });
  describe(`webhook delivery metrics ${language}`, () => {
    it('records endpoint configuration without inventing delivery success', async () => {
      const result = unpack(
        await action(
          args(language, {
            intent: 'create-webhook',
            name: 'Fixture endpoint',
            url: 'https://fixture.invalid/hook',
            events: 'deploy.success, deploy.fail',
          }),
        ),
      );
      expect(result.data).toEqual({ ok: true });

      const webhooks = state.webhooks as Array<Record<string, unknown>>;
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0]).toMatchObject({
        name: 'Fixture endpoint',
        url: 'https://fixture.invalid/hook',
        events: ['deploy.success', 'deploy.fail'],
        active: true,
      });
      expect(webhooks[0].id).toEqual(expect.any(String));
      expect(webhooks[0].createdAt).toEqual(expect.any(String));
      expect(webhooks[0]).not.toHaveProperty('successRate');
      expect(calls).toEqual([
        { path: '/projects/proj-fixture/env-vars', method: 'GET' },
        { path: '/projects/proj-fixture/env-vars', method: 'PUT' },
      ]);
    });
    it('declares metrics unavailable without rewriting a historical fabricated rate', async () => {
      const historical = { id: 'old', successRate: 100, active: true };
      state.webhooks = [historical];

      const result = unpack(await loader(args(language)));
      expect(result.data.data.webhookDeliveryMetrics).toEqual({
        available: false,
        code: 'WEBHOOK_DELIVERY_METRICS_UNAVAILABLE',
      });
      expect(result.data.data.integrationsState.webhooks).toEqual([historical]);
      expect(state.webhooks).toEqual([historical]);
      expect(calls.every((call) => call.method === 'GET')).toBe(true);
    });
  });
}

describe('webhook configuration boundaries', () => {
  it('preserves the upstream permission refusal for endpoint creation', async () => {
    denyRead = true;

    const result = unpack(
      await action(args('en', { intent: 'create-webhook', url: 'https://fixture.invalid/hook' })).catch(
        (error: unknown) => error,
      ),
    );
    expect(result.init?.status).toBe(403);
    expect(state).toEqual(initial);
    expect(calls).toEqual([{ path: '/projects/proj-fixture/env-vars', method: 'GET' }]);
  });
  it('changes only activation when toggling an existing configuration', async () => {
    const historical = { id: 'old', successRate: 100, active: true, url: 'https://fixture.invalid/hook' };
    state.webhooks = [historical];

    const result = unpack(await action(args('en', { intent: 'toggle-webhook', webhookId: 'old', active: 'false' })));
    expect(result.data).toEqual({ ok: true });
    expect(state.webhooks).toEqual([{ ...historical, active: false }]);
    expect(calls).toEqual([
      { path: '/projects/proj-fixture/env-vars', method: 'GET' },
      { path: '/projects/proj-fixture/env-vars', method: 'PUT' },
    ]);
  });
});

describe('Sync boundaries and non-Sync behavior', () => {
  it('keeps missing integration validation', async () => {
    const result = unpack(await action(args('en', { intent: 'sync' })).catch((error: unknown) => error));
    expect(result.init?.status).toBe(400);
    expect(result.data.code).toBe('INTEGRATION_REQUIRED');
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
    expect(state).toEqual(initial);
  });
  it('retains the upstream permission refusal before exposing capability', async () => {
    denyRead = true;

    const result = unpack(
      await action(args('en', { intent: 'sync', integrationId: 'github' })).catch((error: unknown) => error),
    );
    expect(result.init?.status).toBe(403);
    expect(state).toEqual(initial);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });
  it('connecting a new configuration does not fabricate a successful synchronization date', async () => {
    const result = unpack(await action(args('en', { intent: 'connect', integrationId: 'gitlab' })));
    expect(result.data).toEqual({ ok: true });
    expect((state.integrations as Record<string, unknown>).gitlab).not.toHaveProperty('lastSync');
    expect((state.integrations as Record<string, unknown>).github).toEqual(initial.integrations.github);
    expect(calls).toEqual([
      { path: '/projects/proj-fixture/env-vars', method: 'GET' },
      { path: '/projects/proj-fixture/env-vars', method: 'PUT' },
    ]);
  });
  it('reconnecting preserves any old timestamp without advancing it', async () => {
    await action(args('en', { intent: 'connect', integrationId: 'github' }));
    expect((state.integrations as Record<string, { lastSync?: string }>).github.lastSync).toBe(
      initial.integrations.github.lastSync,
    );
  });
});
