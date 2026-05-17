/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import { loader } from './login';

function buildRequest(host: string): Request {
  return new Request(`http://${host}/login`, {
    headers: { host },
  });
}

describe('login route loader', () => {
  it('redirects e-code.ai/login to app.e-code.ai/login with 301', async () => {
    const response = await loader({
      request: buildRequest('e-code.ai'),
      params: {},
      context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
        typeof loader
      >[0]['context'],
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(301);
    expect((response as Response).headers.get('location')).toBe('https://app.e-code.ai/login');
  });

  it('redirects www.e-code.ai/login the same way', async () => {
    const response = await loader({
      request: buildRequest('www.e-code.ai'),
      params: {},
      context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
        typeof loader
      >[0]['context'],
    });

    expect((response as Response).status).toBe(301);
    expect((response as Response).headers.get('location')).toBe('https://app.e-code.ai/login');
  });

  it('treats the host case-insensitively', async () => {
    const response = await loader({
      request: buildRequest('E-Code.AI'),
      params: {},
      context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
        typeof loader
      >[0]['context'],
    });

    expect((response as Response).status).toBe(301);
  });

  it('returns null on the app subdomain so the form renders', async () => {
    const response = await loader({
      request: buildRequest('app.e-code.ai'),
      params: {},
      context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
        typeof loader
      >[0]['context'],
    });

    expect(response).toBeNull();
  });

  it('returns null on localhost so dev mode keeps working', async () => {
    const response = await loader({
      request: buildRequest('localhost:5173'),
      params: {},
      context: { cloudflare: { env: {}, cf: {}, ctx: {}, caches: {} } } as unknown as Parameters<
        typeof loader
      >[0]['context'],
    });

    expect(response).toBeNull();
  });
});
