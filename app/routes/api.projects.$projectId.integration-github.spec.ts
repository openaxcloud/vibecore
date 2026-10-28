import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader } from './api.projects.$projectId.integration-github';

/* Real apiRequest/fetch against an isolated synthetic loopback API; no GitHub call. */
let server: Server;
let calls: Array<{ path: string; method: string; authorization?: string; cookie?: string; body: string }>;
let projectStatus: number;
let projectPayload: unknown;
let verificationStatus: number;
let verificationPayload: unknown;
let breakTransport: boolean;

const originalFetch = globalThis.fetch;
const account = { login: 'fixture-user', htmlUrl: 'https://github.com/fixture-user' };

beforeEach(async () => {
  calls = [];
  projectStatus = 200;
  projectPayload = { project: { id: 'fixture-project' } };
  verificationStatus = 200;
  verificationPayload = { account, verifiedAt: new Date().toISOString() };
  breakTransport = false;
  server = createServer(async (request, response) => {
    let body = '';

    for await (const chunk of request) {
      body += String(chunk);
    }

    const path = request.url ?? '';
    calls.push({
      path,
      method: request.method ?? '',
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
      body,
    });
    response.setHeader('content-type', 'application/json');

    if (path === '/projects/fixture-project' && request.method === 'GET') {
      response.writeHead(projectStatus).end(JSON.stringify(projectPayload));
      return;
    }

    if (path === '/api/integrations/github/verify' && request.method === 'POST') {
      if (breakTransport) {
        response.destroy();
        return;
      }

      response.writeHead(verificationStatus).end(JSON.stringify(verificationPayload));

      return;
    }

    response.writeHead(500).end('{"error":"unexpected synthetic request"}');
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
});

function args(language = 'en', init: RequestInit = {}, projectId: string | undefined = 'fixture-project') {
  const headers = new Headers({
    'content-type': 'application/json',
    'accept-language': language,
    cookie: `vc_session=synthetic-session-only; ecode_lang=${language}; unrelated=never-forward`,
    origin: 'http://app.local',
  });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  const method = init.method ?? 'POST';

  return {
    request: new Request('http://app.local/api/projects/fixture-project/integration-github', {
      ...init,
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : (init.body ?? '{}'),
    }),
    params: { projectId },
    context: {},
  };
}

it('authorizes the project first, then verifies the existing caller account and returns only allowed fields', async () => {
  const verifiedAt = new Date().toISOString();
  verificationPayload = {
    account: { ...account, id: 42, token: 'synthetic-do-not-reflect' },
    verifiedAt,
    accessToken: 'synthetic-do-not-reflect',
  };

  const response = await action(args());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, account, verifiedAt });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(calls.map((call) => [call.method, call.path])).toEqual([
    ['GET', '/projects/fixture-project'],
    ['POST', '/api/integrations/github/verify'],
  ]);
  expect(JSON.parse(calls[1].body)).toEqual({});
  expect(
    calls.every((call) => call.authorization === 'Bearer synthetic-session-only' && call.cookie === undefined),
  ).toBe(true);
});

for (const status of [401, 403, 404, 500]) {
  it(`never verifies a GitHub account when project authorization fails with ${status}`, async () => {
    projectStatus = status;
    projectPayload = { error: 'synthetic-private-upstream-details' };

    const response = await action(args('fr'));
    expect(response.status).toBe(status === 500 ? 502 : status);
    expect(calls.map((call) => call.path)).toEqual(['/projects/fixture-project']);

    const text = await response.text();
    expect(text).not.toContain('synthetic-private');
    expect(JSON.parse(text).ok).toBe(false);
    expect(response.headers.get('content-language')).toBe('fr');
  });
}

it('rejects a malformed project success before the account call', async () => {
  projectPayload = { project: { id: 'another-project' } };

  const response = await action(args());
  expect(response.status).toBe(502);
  expect(calls).toHaveLength(1);
});

for (const [code, status] of [
  ['CONNECTOR_NOT_LINKED', 401],
  ['CONNECTOR_NEEDS_RECONNECT', 401],
  ['CONNECTOR_DISABLED', 403],
  ['AUTH_REQUIRED', 401],
  ['CONNECTOR_TOKEN_UNAVAILABLE', 503],
  ['PROVIDER_FORBIDDEN', 403],
  ['PROVIDER_RESPONSE_MALFORMED', 502],
  ['PROVIDER_FAILED', 502],
] as const) {
  describe(code, () => {
    for (const language of ['en', 'fr']) {
      it(`returns a safe ${language} failure instead of a connected account`, async () => {
        verificationStatus = status;
        verificationPayload = { code, error: 'synthetic-token-provider-message', account };

        const response = await action(args(language));
        const payload = await response.json();
        expect(response.status).toBe(status);
        expect(payload.ok).toBe(false);
        expect(payload.account).toBeUndefined();
        expect(payload.verifiedAt).toBeUndefined();
        expect(JSON.stringify(payload)).not.toContain('synthetic-token');
        expect(response.headers.get('content-language')).toBe(language);
        expect(response.headers.get('cache-control')).toBe('no-store');

        if (code === 'CONNECTOR_NOT_LINKED') {
          expect(payload.error).toBe(
            language === 'fr' ? 'Connectez GitHub pour continuer.' : 'Connect GitHub before continuing.',
          );
        }
      });
    }
  });
}

for (const payload of [
  null,
  {},
  'not-json-object',
  { account },
  { account: { ...account, login: 'bad--login' }, verifiedAt: new Date().toISOString() },
  { account: { ...account, login: 'x'.repeat(40) }, verifiedAt: new Date().toISOString() },
  {
    account: { ...account, htmlUrl: 'https://github.com.evil.test/fixture-user' },
    verifiedAt: new Date().toISOString(),
  },
  { account: { ...account, htmlUrl: 'https://github.com/other-user' }, verifiedAt: new Date().toISOString() },
  {
    account: { ...account, htmlUrl: 'https://github.com/fixture-user?token=synthetic' },
    verifiedAt: new Date().toISOString(),
  },
  { ok: false, account, verifiedAt: new Date().toISOString() },
  { error: 'upstream error', account, verifiedAt: new Date().toISOString() },
  { account, verifiedAt: 'invalid' },
  { account, verifiedAt: 123 },
]) {
  it(`rejects malformed verification ${JSON.stringify(payload)}`, async () => {
    verificationPayload = payload;

    const response = await action(args());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, code: 'PROVIDER_RESPONSE_MALFORMED' });
  });
}

it('reports a real loopback socket failure without exposing internal details', async () => {
  breakTransport = true;

  const response = await action(args());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ ok: false, code: 'GITHUB_VERIFICATION_UNAVAILABLE' });
});

for (const init of [
  { headers: { origin: 'https://untrusted.test' } },
  { headers: { 'sec-fetch-site': 'cross-site' } },
  { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=y' },
  { body: '{' },
  { body: '[]' },
  { body: '{"path":"/__token__"}' },
]) {
  it(`rejects unsupported requests before any API access: ${JSON.stringify(init)}`, async () => {
    const response = await action(args('en', init));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(calls).toEqual([]);
  });
}

for (const method of ['GET', 'PUT', 'DELETE']) {
  it(`rejects ${method} with Allow POST`, async () => {
    const requestArgs = args('en', { method });
    const response = method === 'GET' ? loader(requestArgs) : await action(requestArgs);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(calls).toEqual([]);
  });
}

it('accepts the same public origin behind a TLS-terminating reverse proxy', async () => {
  const response = await action(args('en', { headers: { origin: 'https://app.local', 'x-forwarded-proto': 'https' } }));
  expect(response.status).toBe(200);
  expect(calls).toHaveLength(2);
});

it('does not trust a forwarded host to authorize an unrelated origin', async () => {
  const response = await action(
    args('en', {
      headers: {
        origin: 'https://attacker.invalid',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'attacker.invalid',
      },
    }),
  );
  expect(response.status).toBe(403);
  expect(calls).toHaveLength(0);
});
