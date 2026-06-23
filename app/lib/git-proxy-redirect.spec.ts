import { describe, it, expect } from 'vitest';
import { buildRedirectHeaders } from './git-proxy-redirect';

function baseHeaders(): Headers {
  const h = new Headers();
  h.set('Host', 'github.com');
  h.set('authorization', 'Bearer secret-pat');
  h.set('x-authorization', 'Bearer secret-pat');
  h.set('accept', 'application/x-git-upload-pack-result');

  return h;
}

describe('buildRedirectHeaders', () => {
  it('recomputes Host for a cross-host redirect (stale Host bug)', () => {
    const out = buildRedirectHeaders(baseHeaders(), 'https://codeload.github.com/foo/bar', 'https://github.com');

    expect(out.get('host')).toBe('codeload.github.com');
  });

  it('drops the git credential on a cross-origin hop', () => {
    const out = buildRedirectHeaders(baseHeaders(), 'https://evil.example.com/x', 'https://github.com');

    expect(out.get('authorization')).toBeNull();
    expect(out.get('x-authorization')).toBeNull();
    expect(out.get('host')).toBe('evil.example.com');
  });

  it('keeps the credential and Host on a same-origin hop with a different path', () => {
    const out = buildRedirectHeaders(baseHeaders(), 'https://github.com/foo/bar/info/refs', 'https://github.com');

    expect(out.get('authorization')).toBe('Bearer secret-pat');
    expect(out.get('x-authorization')).toBe('Bearer secret-pat');
    expect(out.get('host')).toBe('github.com');
  });

  it('treats a port change as a different host and updates Host accordingly', () => {
    const out = buildRedirectHeaders(baseHeaders(), 'https://github.com:8443/foo', 'https://github.com');

    // Different origin (port) → credential dropped and Host carries the port.
    expect(out.get('authorization')).toBeNull();
    expect(out.get('host')).toBe('github.com:8443');
  });

  it('strips the credential when the initial origin is unknown (null)', () => {
    const out = buildRedirectHeaders(baseHeaders(), 'https://github.com/x', null);

    expect(out.get('authorization')).toBeNull();
    expect(out.get('host')).toBe('github.com');
  });

  it('preserves non-credential headers across the hop', () => {
    const out = buildRedirectHeaders(baseHeaders(), 'https://codeload.github.com/x', 'https://github.com');

    expect(out.get('accept')).toBe('application/x-git-upload-pack-result');
  });

  it('drops the Host header when the next url is unparseable', () => {
    const out = buildRedirectHeaders(baseHeaders(), 'not a url', 'https://github.com');

    expect(out.get('host')).toBeNull();

    // Unparseable origin !== initialOrigin → credential dropped too.
    expect(out.get('authorization')).toBeNull();
  });
});
