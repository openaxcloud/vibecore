/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action, loader, meta } from './signup';
import { toResponse } from '~/lib/test/rr7-data';

const ORIGINAL_ENV = {
  SAAS_API_URL: process.env.SAAS_API_URL,
  API_BASE_URL: process.env.API_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

function buildLoaderArgs(host: string): Parameters<typeof loader>[0] {
  const request = new Request(`http://${host}/register`, { headers: { host } });
  return {
    request,
    params: {},
    context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
      typeof loader
    >[0]['context'],
  };
}

function buildActionArgs(fields: Record<string, string>): Parameters<typeof action>[0] {
  const body = new URLSearchParams(fields).toString();

  const request = new Request('http://app.e-code.ai/register', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', host: 'app.e-code.ai' },
    body,
  });

  return {
    request,
    params: {},
    context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
      typeof action
    >[0]['context'],
  };
}

beforeEach(() => {
  process.env.SAAS_API_URL = 'http://api.test.local';
  delete process.env.API_BASE_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV) as Array<[string, string | undefined]>) {
    if (value === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      (process.env as Record<string, string>)[key] = value;
    }
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('signup route loader', () => {
  it('redirects e-code.ai/register to app.e-code.ai/register with 301', async () => {
    const response = toResponse(await loader(buildLoaderArgs('e-code.ai')));

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://app.e-code.ai/register');
  });

  it('redirects www.e-code.ai/register the same way', async () => {
    const response = toResponse(await loader(buildLoaderArgs('www.e-code.ai')));

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://app.e-code.ai/register');
  });

  it('returns null on app.e-code.ai so the form renders', async () => {
    const response = toResponse(await loader(buildLoaderArgs('app.e-code.ai')));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ language: 'en' });
  });

  it('returns null on localhost so dev mode keeps working', async () => {
    const response = toResponse(await loader(buildLoaderArgs('localhost:5173')));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ language: 'en' });
  });

  it('publishes localized French route metadata', () => {
    const metadata = meta({ data: { language: 'fr' } } as Parameters<typeof meta>[0]);

    expect(metadata).toContainEqual({ title: 'Créer un compte - E-Code' });
    expect(metadata).toContainEqual({
      name: 'description',
      content: 'Créez votre compte E-Code et commencez à développer des applications de production.',
    });
  });
});

describe('signup route action', () => {
  it('rejects passwords shorter than 8 characters before hitting the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(
      await action(buildActionArgs({ email: 'ada@example.com', password: 'short', confirmPassword: 'short' })),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();

    const payload = (await response.json()) as { errorCode: string; errorParams?: { count: number } };
    expect(payload).toMatchObject({ errorCode: 'AUTH_PASSWORD_TOO_SHORT', errorParams: { count: 8 } });
  });

  it('rejects mismatched password confirmation', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(
      await action(
        buildActionArgs({
          email: 'ada@example.com',
          password: 'correcthorse',
          confirmPassword: 'wronghorse123',
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();

    const payload = (await response.json()) as { errorCode: string };
    expect(payload.errorCode).toBe('AUTH_PASSWORD_MISMATCH');
  });

  it('posts to /auth/register and redirects to /dashboard with a session cookie on success', async () => {
    let capturedUrl: string | URL | undefined;
    let capturedBody: string | undefined;

    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input as string | URL;
      capturedBody = typeof init?.body === 'string' ? init.body : undefined;

      return new Response(JSON.stringify({ token: 'session_test_token' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const response = toResponse(
      await action(
        buildActionArgs({
          name: 'Ada Lovelace',
          email: 'Ada@Example.COM',
          password: 'correcthorse',
          confirmPassword: 'correcthorse',
          organizationName: 'Analytical Engine Co',
        }),
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(response.headers.get('set-cookie')).toContain('vc_session=session_test_token');

    expect(String(capturedUrl)).toBe('http://api.test.local/auth/register');

    const sent = JSON.parse(capturedBody ?? '{}') as Record<string, string>;
    expect(sent.email).toBe('ada@example.com'); // normalized to lowercase
    expect(sent.password).toBe('correcthorse');
    expect(sent.name).toBe('Ada Lovelace');
    expect(sent.organizationName).toBe('Analytical Engine Co');
  });

  it('omits empty name and organizationName from the API payload', async () => {
    let capturedBody: string | undefined;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = typeof init?.body === 'string' ? init.body : undefined;
        return new Response(JSON.stringify({ token: 'session_test_token' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await action(
      buildActionArgs({
        name: '',
        email: 'solo@example.com',
        password: 'correcthorse',
        confirmPassword: 'correcthorse',
        organizationName: '',
      }),
    );

    const sent = JSON.parse(capturedBody ?? '{}') as Record<string, string>;
    expect(sent).not.toHaveProperty('name');
    expect(sent).not.toHaveProperty('organizationName');
  });

  it('surfaces AUTH_EMAIL_EXISTS as a friendly inline error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Email already registered', code: 'AUTH_EMAIL_EXISTS' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const response = toResponse(
      await action(
        buildActionArgs({
          email: 'ada@example.com',
          password: 'correcthorse',
          confirmPassword: 'correcthorse',
        }),
      ),
    );

    expect(response.status).toBe(409);

    const payload = (await response.json()) as { errorCode: string; fields?: { email?: string } };
    expect(payload.errorCode).toBe('AUTH_EMAIL_EXISTS');
    expect(payload.fields?.email).toBe('ada@example.com');
  });
});
