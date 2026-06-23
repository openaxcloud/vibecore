import { describe, expect, it } from 'vitest';
import { isSameOrigin } from './origin';

describe('isSameOrigin', () => {
  const appUrl = 'http://localhost:5173';

  it('allows the exact app origin', () => {
    expect(isSameOrigin('http://localhost:5173', appUrl)).toBe(true);
    expect(isSameOrigin('http://localhost:5173/some/path?q=1', appUrl)).toBe(true);
  });

  it('rejects a different localhost port (preview/dev/AI-app servers)', () => {
    expect(isSameOrigin('http://localhost:3000', appUrl)).toBe(false);
    expect(isSameOrigin('http://localhost:8080/app', appUrl)).toBe(false);
    expect(isSameOrigin('http://localhost:5174', appUrl)).toBe(false);
  });

  it('rejects 127.0.0.1 when the app runs on the localhost name (distinct hostname)', () => {
    expect(isSameOrigin('http://127.0.0.1:5173', appUrl)).toBe(false);
  });

  it('rejects a different hostname', () => {
    expect(isSameOrigin('http://evil.example.com:5173', appUrl)).toBe(false);
    expect(isSameOrigin('http://localhost.evil.com:5173', appUrl)).toBe(false);
  });

  it('rejects a mismatched scheme', () => {
    expect(isSameOrigin('https://localhost:5173', appUrl)).toBe(false);
    expect(isSameOrigin('file:///localhost:5173', appUrl)).toBe(false);
  });

  it('rejects unparseable / non-absolute targets', () => {
    expect(isSameOrigin('not a url', appUrl)).toBe(false);
    expect(isSameOrigin('/relative/path', appUrl)).toBe(false);
    expect(isSameOrigin('', appUrl)).toBe(false);
  });

  it('matches when the app runs on a non-default dev port', () => {
    expect(isSameOrigin('http://localhost:51234/x', 'http://localhost:51234')).toBe(true);
    expect(isSameOrigin('http://localhost:5173', 'http://localhost:51234')).toBe(false);
  });

  it('returns false when the reference URL itself is invalid', () => {
    expect(isSameOrigin('http://localhost:5173', 'not a url')).toBe(false);
  });
});
