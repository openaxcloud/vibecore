import { describe, expect, it, vi } from 'vitest';
import { buildScreenshotterApp, type PageRenderer } from './app.js';

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const okRenderer: PageRenderer = {
  async render() {
    return PNG;
  },
};

/*
 * AUDX-006: an EMPTY allowlist is now a refusal, not "allow everything" — that
 * default is what made /capture an open renderer against internal addresses.
 * Tests that exercise unrelated behaviour (auth, renderer errors) therefore have
 * to configure the service the way production must configure it. `resolveHost`
 * is stubbed so these tests never touch real DNS.
 */
async function build(overrides: Partial<Parameters<typeof buildScreenshotterApp>[0]> = {}) {
  return buildScreenshotterApp({
    renderer: okRenderer,
    allowedHostSuffixes: ['x.example', 'preview.e-code.ai'],
    resolveHost: async () => ['93.184.216.34'],
    ...overrides,
  });
}

describe('screenshotter /capture', () => {
  it('renders an allowed URL to PNG bytes', async () => {
    const app = await build({ allowedHostSuffixes: ['preview.e-code.ai'] });

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      payload: { url: 'https://ws-1.preview.e-code.ai/', projectId: 'p1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.from(res.rawPayload).equals(PNG)).toBe(true);
    await app.close();
  });

  it('rejects a missing/wrong bearer secret with 401 (and never renders)', async () => {
    const render = vi.fn(okRenderer.render);
    const app = await build({ sharedSecret: 'sekret', renderer: { render } });

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      headers: { authorization: 'Bearer nope' },
      payload: { url: 'https://ws-1.preview.e-code.ai/' },
    });

    expect(res.statusCode).toBe(401);
    expect(render).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts the correct bearer secret', async () => {
    const app = await build({ sharedSecret: 'sekret' });

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      headers: { authorization: 'Bearer sekret' },
      payload: { url: 'https://x.example/' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('400s an invalid or non-http URL', async () => {
    const app = await build();

    expect((await app.inject({ method: 'POST', url: '/capture', payload: { url: 'not a url' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/capture', payload: { url: 'file:///etc/passwd' } })).statusCode).toBe(
      400,
    );
    await app.close();
  });

  it('403s a host outside the SSRF allowlist (blocks internal targets)', async () => {
    const render = vi.fn(okRenderer.render);
    const app = await build({ allowedHostSuffixes: ['preview.e-code.ai'], renderer: { render } });

    const res = await app.inject({
      method: 'POST',
      url: '/capture',
      payload: { url: 'http://169.254.169.254/latest/meta-data/' },
    });

    expect(res.statusCode).toBe(403);
    expect(render).not.toHaveBeenCalled();
    await app.close();
  });

  it('502s when the renderer throws', async () => {
    const app = await build({
      renderer: {
        async render() {
          throw new Error('chromium boom');
        },
      },
    });

    const res = await app.inject({ method: 'POST', url: '/capture', payload: { url: 'https://x.example/' } });

    expect(res.statusCode).toBe(502);
    await app.close();
  });

  it('serves /health', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
