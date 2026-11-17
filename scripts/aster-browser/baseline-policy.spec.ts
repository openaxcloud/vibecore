import { expect, it } from 'vitest';
import { browserDestinationAllowed as allowed } from './baseline-policy.js';

it('permits only the fixed app and path-scoped preview loopback origins', () => {
  const app = 'http://127.0.0.1:5173';
  const preview = 'http://127.0.0.1:3020';
  expect(allowed(app + '/register', app, preview)).toBe(true);
  expect(allowed(preview + '/p/ws-one/5173/', app, preview)).toBe(true);
  expect(allowed('ws://127.0.0.1:3020/p/ws-one/5173/hmr', app, preview)).toBe(true);

  for (const target of [
    preview + '/admin',
    preview + '/api/chat',
    app + '/api/chat',
    'http://127.0.0.1:9999/p/w/1/',
    'https://example.test/p/w/1/',
  ]) {
    expect(allowed(target, app, preview)).toBe(false);
  }
  expect(allowed(preview + '/p/w/1/', app)).toBe(false);
  expect(() => allowed(app, app, 'http://example.test:3020')).toThrow();
});
