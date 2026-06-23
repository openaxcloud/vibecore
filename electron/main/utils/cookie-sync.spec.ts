import { describe, expect, it } from 'vitest';
import { appOriginCookieFilter, createCookieSnapshot, diffCookies, recordCookies } from './cookie-sync';

describe('appOriginCookieFilter', () => {
  it('scopes the cookie lookup to the request origin (not an empty all-cookies filter)', () => {
    expect(appOriginCookieFilter('http://localhost:5173/some/path?q=1')).toEqual({
      url: 'http://localhost:5173',
    });
  });

  it('drops path, query and hash so only the origin participates in cookie matching', () => {
    expect(appOriginCookieFilter('http://localhost:5173/auth/callback#frag')).toEqual({
      url: 'http://localhost:5173',
    });
  });

  it('distinguishes app origin from a sibling preview port on the same host', () => {
    /*
     * In-app previews / AI apps run on other localhost ports in the shared default
     * session; the filter must be specific to the app port so their cookies are excluded.
     */
    expect(appOriginCookieFilter('http://localhost:5173/').url).not.toEqual(
      appOriginCookieFilter('http://localhost:3000/').url,
    );
  });
});

describe('cookie-sync', () => {
  it('returns all cookies on first sync (empty snapshot)', () => {
    const snapshot = createCookieSnapshot();

    const cookies = [
      { name: 'session', value: 'abc' },
      { name: 'theme', value: 'dark' },
    ];

    expect(diffCookies(cookies, snapshot)).toEqual(cookies);
  });

  it('returns nothing when cookies are unchanged since the last write', () => {
    const snapshot = createCookieSnapshot();

    const cookies = [
      { name: 'session', value: 'abc' },
      { name: 'theme', value: 'dark' },
    ];

    recordCookies(diffCookies(cookies, snapshot), snapshot);

    // Same cookies again -> no disk write needed.
    expect(diffCookies(cookies, snapshot)).toEqual([]);
  });

  it('returns only the cookie whose value changed', () => {
    const snapshot = createCookieSnapshot();

    const initial = [
      { name: 'session', value: 'abc' },
      { name: 'theme', value: 'dark' },
    ];
    recordCookies(diffCookies(initial, snapshot), snapshot);

    const updated = [
      { name: 'session', value: 'xyz' }, // changed
      { name: 'theme', value: 'dark' }, // unchanged
    ];

    expect(diffCookies(updated, snapshot)).toEqual([{ name: 'session', value: 'xyz' }]);
  });

  it('returns newly added cookies', () => {
    const snapshot = createCookieSnapshot();
    const initial = [{ name: 'session', value: 'abc' }];
    recordCookies(diffCookies(initial, snapshot), snapshot);

    const withNew = [
      { name: 'session', value: 'abc' },
      { name: 'csrf', value: 'tok' }, // new
    ];

    expect(diffCookies(withNew, snapshot)).toEqual([{ name: 'csrf', value: 'tok' }]);
  });

  it('keeps the snapshot accurate across multiple writes', () => {
    const snapshot = createCookieSnapshot();

    // Page load 1
    let changed = diffCookies([{ name: 'a', value: '1' }], snapshot);
    recordCookies(changed, snapshot);
    expect(changed).toHaveLength(1);

    // Page load 2 - nothing changed -> zero disk I/O
    changed = diffCookies([{ name: 'a', value: '1' }], snapshot);
    recordCookies(changed, snapshot);
    expect(changed).toHaveLength(0);

    // Page load 3 - value rotates
    changed = diffCookies([{ name: 'a', value: '2' }], snapshot);
    recordCookies(changed, snapshot);
    expect(changed).toEqual([{ name: 'a', value: '2' }]);

    // Page load 4 - settled again
    expect(diffCookies([{ name: 'a', value: '2' }], snapshot)).toEqual([]);
  });

  it('does not mutate the snapshot from diffCookies alone (record is explicit)', () => {
    const snapshot = createCookieSnapshot();
    const cookies = [{ name: 'session', value: 'abc' }];

    diffCookies(cookies, snapshot);

    // Without recordCookies the snapshot stays empty, so a re-diff still reports it.
    expect(diffCookies(cookies, snapshot)).toEqual(cookies);
  });
});
