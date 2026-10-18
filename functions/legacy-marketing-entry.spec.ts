import { describe, expect, it } from 'vitest';
import { onRequest } from './[[path]]';

describe('secondary Pages adapter legacy entry', () => {
  it.each([
    '/ecode-static/',
    '//ecode-static/index.html',
    '///ecode-static/',
    '/ecode-static/index.html',
    '/ecode-static%2f.%2findex.html',
    '/ecode-static%2f..%2fecode-static%2findex.html',
    '/ecode-static/index',
    '/%65code-static/',
  ])('redirects %s before loading the application', async (path) => {
    const response = await onRequest({ request: new Request(`https://e-code.ai${path}?lang=fr`) } as Parameters<
      typeof onRequest
    >[0]);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?lang=fr');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
