import { describe, expect, it } from 'vitest';
import { loader } from './sw[.]js';

describe('/sw.js route', () => {
  it('serves the service worker without immutable static caching', async () => {
    const response = await loader({
      request: new Request('https://e-code.ai/sw.js'),
      params: {},
      context: {},
    });

    expect(response.headers.get('content-type')).toContain('application/javascript');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('service-worker-allowed')).toBe('/');

    const body = await response.text();

    expect(body).toContain("const CACHE_NAME = 'vibecore-shell-v2'");
    expect(body).toContain("fetch(request, { cache: 'no-store' })");
    expect(body).toContain('caches.delete(key)');
    expect(body).not.toContain("caches.match('/dashboard')");
    expect(body).not.toContain('cachedDashboard');
  });
});
