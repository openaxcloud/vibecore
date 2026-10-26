import { encryptJson } from '@vibecore/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

const TOKEN = 'synthetic-github-token-not-a-real-credential';
const apps: Awaited<ReturnType<typeof buildApiApp>>[] = [];
beforeEach(() => {
  vi.stubEnv('ENCRYPTION_SECRET', 'synthetic-encryption-key-for-tests-only');
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function fixture() {
  const store = new TestApiStore();

  const app = await buildApiApp({
    store,
    emailProvider: {
      async send() {
        /* No messages are sent by synthetic registration fixtures. */
      },
    },
  });
  apps.push(app);

  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'github-verification@example.test',
      password: 'password123',
      name: 'Verifier',
      organizationName: 'Verify',
    },
  });
  expect(register.statusCode).toBe(201);

  const { token, user } = register.json() as { token: string; user: { id: string } };

  const link = (userId = user.id, encrypted = encryptJson({ value: TOKEN })) =>
    store.upsertUserConnection({
      userId,
      provider: 'github',
      externalAccountId: '42',
      externalAccountLabel: 'octocat',
      accessTokenEncrypted: encrypted,
      scopes: [],
      createdByUserId: userId,
    });
  const verify = (payload?: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/integrations/github/verify',
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  const provider = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ id: 42, login: 'octocat', email: 'private@example.test' })));

  return { app, store, link, verify, provider };
}

describe('GitHub verification (synthetic provider; real adapter, auth and store)', () => {
  it('uses only server-held credentials and returns an allowlisted account', async () => {
    const { link, verify, provider } = await fixture();
    await link();

    const response = await verify({});
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      account: { login: 'octocat', htmlUrl: 'https://github.com/octocat' },
      verifiedAt: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(response.json().verifiedAt))).toBe(true);
    expect(provider).toHaveBeenCalledOnce();
    expect(provider.mock.calls[0][0]).toBe('https://api.github.com/user');
    expect(provider.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      signal: expect.any(AbortSignal),
      headers: { authorization: `token ${TOKEN}` },
    });
    expect(response.body).not.toContain(TOKEN);
    expect(response.body).not.toContain('private@example.test');
  });
  it.each([{ provider: 'other' }, { url: 'https://attacker.invalid' }, { token: 'attacker' }, []])(
    'rejects caller configuration %j',
    async (payload) => {
      const { link, verify, provider } = await fixture();
      await link();
      expect((await verify(payload)).statusCode).toBe(400);
      expect(provider).not.toHaveBeenCalled();
    },
  );
  it('requires authentication', async () => {
    const { app, provider } = await fixture();
    expect((await app.inject({ method: 'POST', url: '/api/integrations/github/verify' })).statusCode).toBe(401);
    expect(provider).not.toHaveBeenCalled();
  });
  it('does not use another user connection', async () => {
    const { link, verify, provider } = await fixture();
    await link('other-user');
    expect((await verify()).json().code).toBe('CONNECTOR_NOT_LINKED');
    expect(provider).not.toHaveBeenCalled();
  });
  it('honors the admin disable switch before any provider access', async () => {
    const { store, link, verify, provider } = await fixture();
    await link();
    await store.upsertConnectorOAuthConfig({ provider: 'github', enabled: false });
    expect((await verify()).json().code).toBe('CONNECTOR_DISABLED');
    expect(provider).not.toHaveBeenCalled();
  });
  it('reports a missing link', async () => {
    const { verify, provider } = await fixture();
    expect((await verify()).json().code).toBe('CONNECTOR_NOT_LINKED');
    expect(provider).not.toHaveBeenCalled();
  });
  it('does not decrypt invalid tokens or disclose them', async () => {
    const { link, verify, provider } = await fixture();
    await link(undefined, 'broken-ciphertext');

    const response = await verify();
    expect(response.json().code).toBe('CONNECTOR_TOKEN_UNAVAILABLE');
    expect(response.body).not.toContain('broken-ciphertext');
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])('handles provider HTTP %s without leaking content', async (status) => {
    const { store, link, verify, provider } = await fixture();
    const connection = await link();
    provider.mockResolvedValue(new Response(`private-provider-detail ${TOKEN}`, { status }));

    const response = await verify();
    expect(response.statusCode).toBe(status === 401 || status === 403 ? status : 502);
    expect(response.json().code).toBe(
      status === 401 ? 'CONNECTOR_NEEDS_RECONNECT' : status === 403 ? 'PROVIDER_FORBIDDEN' : 'PROVIDER_FAILED',
    );
    expect(response.body).not.toContain(TOKEN);
    expect((await store.getUserConnectionById(connection.id))?.status).toBe(
      status === 401 ? 'needs_reconnect' : 'active',
    );

    if (status === 401) {
      provider.mockClear();
      expect((await verify()).json().code).toBe('CONNECTOR_NEEDS_RECONNECT');
      expect(provider).not.toHaveBeenCalled();
    }
  });
  it.each([
    null,
    [],
    {},
    { id: '42', login: 'octocat' },
    { id: 42, login: 'octocat', error: 'provider failure' },
    { id: 42, login: 'octocat', ok: false },
    { id: 0, login: 'octocat' },
    { id: 1.5, login: 'octocat' },
    { id: 43, login: 'octocat' },
    { id: 42, login: '../attack' },
    { id: 42, login: 'a--b' },
    { id: 42, login: '-invalid' },
    { id: 42, login: 'a'.repeat(40) },
    { id: 42, login: {} },
  ])('rejects malformed or mismatched identity %j', async (payload) => {
    const { link, verify, provider } = await fixture();
    await link();
    provider.mockResolvedValue(new Response(JSON.stringify(payload)));
    expect((await verify()).json().code).toBe('PROVIDER_RESPONSE_MALFORMED');
  });
  it('rejects invalid JSON', async () => {
    const { link, verify, provider } = await fixture();
    await link();
    provider.mockResolvedValue(new Response('invalid JSON'));
    expect((await verify()).json().code).toBe('PROVIDER_RESPONSE_MALFORMED');
  });
  it('contains network errors without marking the connection revoked', async () => {
    const { store, link, verify, provider } = await fixture();
    const connection = await link();
    provider.mockRejectedValue(new Error(`private network ${TOKEN}`));

    const response = await verify();
    expect(response.json().code).toBe('PROVIDER_FAILED');
    expect(response.body).not.toContain(TOKEN);
    expect((await store.getUserConnectionById(connection.id))?.status).toBe('active');
  });
  it.each(['headers', 'body'])('bounds provider %s waiting with the deadline signal', async (phase) => {
    const { store, link, verify, provider } = await fixture();
    const connection = await link();
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => nativeTimeout(10));
    provider.mockImplementation(async (_input, init) => {
      const signal = init!.signal!;

      if (phase === 'headers') {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }

      return new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
          },
        }),
      );
    });

    const response = await verify();
    expect(response.statusCode).toBe(502);
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect((await store.getUserConnectionById(connection.id))?.status).toBe('active');
  });
});
