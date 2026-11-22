import { describe, expect, it } from 'vitest';
import { recipeBrowserTarget, recipeSafeResponse } from './browser-http.js';

describe('private browser reseed forwarding policy', () => {
  it.each([
    'http://localhost:5173/projects/test-project/ide',
    'http://127.0.0.1:3001/api/runtime/workspaces/ws-fixture/import',
  ])('allows browser HTTP only on the local recipe: %s', (url) => {
    expect(recipeBrowserTarget(url)?.href).toBe(url);
  });

  it.each([
    'https://app.e-code.ai/projects/test-project/ide',
    'http://192.0.2.23:3001/api/runtime/workspaces',
    'http://localhost:5174/projects/test-project/ide',
    'http://localhost:5173.example.invalid/projects/test-project/ide',
    'http://127.0.0.1:3001/projects/test-project',
    'http://127.0.0.1:3001/api/runtime-backup',
    'http://user:password@localhost:5173/projects/test-project/ide',
    'http://localhost:5173/path#fragment',
    'ws://127.0.0.1:3001/api/runtime/workspaces/ws-fixture/logs',
    '/path',
    'not a URL',
  ])('refuses out-of-scope browser HTTP: %s', (url) => {
    expect(recipeBrowserTarget(url)).toBeUndefined();
  });

  it.each([301, 302, 303, 307, 308])('refuses redirect %s before Chromium consumes any headers', (status) => {
    for (const target of ['/login', '//192.0.2.4/blocked', 'http://localhost:5173/first-hop']) {
      expect(recipeSafeResponse(status, ['LoCaTiOn', target, 'Set-Cookie', 'ignored=yes'])).toBe(false);
    }
    expect(recipeSafeResponse(status, [])).toBe(false);
  });

  it('refuses Location or Refresh headers even with a nonredirect status', () => {
    expect(recipeSafeResponse(304, ['Location', '/other'])).toBe(false);
    expect(recipeSafeResponse(200, ['Refresh', '0;url=http://192.0.2.4/'])).toBe(false);
    expect(recipeSafeResponse(200, ['Link', 'Location'])).toBe(true);
  });

  it('keeps ordinary responses and nonredirecting 304', () => {
    expect(recipeSafeResponse(200, ['Set-Cookie', 'a=1', 'Set-Cookie', 'b=2'])).toBe(true);
    expect(recipeSafeResponse(204, [])).toBe(true);
    expect(recipeSafeResponse(304, ['ETag', 'local-fixture'])).toBe(true);
  });
});
