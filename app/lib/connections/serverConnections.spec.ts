/**
 * @vitest-environment jsdom
 *
 * AUDX-007 — get the provider PAT out of the browser.
 *
 * The legacy stores persisted the token in localStorage: readable by any script
 * on the origin, surviving reloads indefinitely. One XSS was every forge and
 * host the user had connected.
 *
 * The order of operations is the whole design. Clearing the browser copy BEFORE
 * confirming the server holds it would lose the user's connection whenever the
 * upload fails — offline, expired key, server down — turning a security fix
 * into data loss. These tests pin that order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LEGACY_CONNECTION_STORAGE_KEYS, migrateLegacyTokenToServer, storeTokenServerSide } from './serverConnections';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AUDX-007 server-side connection storage', () => {
  it('posts the key to the configure endpoint with a CSRF header', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(storeTokenServerSide('vercel', 'pat_123')).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/integrations/api-key/vercel/configure');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBeTruthy();
  });

  it('reports failure rather than throwing when the server refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 400 })),
    );

    await expect(storeTokenServerSide('vercel', 'pat_123')).resolves.toBe(false);
  });

  it('reports failure rather than throwing when the network is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    await expect(storeTokenServerSide('vercel', 'pat_123')).resolves.toBe(false);
  });
});

describe('AUDX-007 one-time migration', () => {
  function legacyStore(token?: string) {
    let cleared = false;
    return {
      read: () => token,
      clear: () => {
        cleared = true;
        token = undefined;
      },
      wasCleared: () => cleared,
    };
  }

  it('uploads the token then clears the browser copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );

    const store = legacyStore('pat_123');

    await expect(migrateLegacyTokenToServer('vercel', store.read, store.clear)).resolves.toBe(true);
    expect(store.wasCleared()).toBe(true);
  });

  /*
   * THE test. A failed upload must leave the browser EXACTLY as it was — the
   * user keeps a working connection. Clearing here would be data loss dressed
   * as a security fix.
   */
  it('does NOT clear the browser copy when the upload fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );

    const store = legacyStore('pat_123');

    await expect(migrateLegacyTokenToServer('vercel', store.read, store.clear)).resolves.toBe(false);
    expect(store.wasCleared()).toBe(false);
    expect(store.read()).toBe('pat_123');
  });

  it('does nothing when there is no legacy token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const store = legacyStore(undefined);

    await expect(migrateLegacyTokenToServer('vercel', store.read, store.clear)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('knows the legacy storage key of every provider it claims to cover', () => {
    expect(Object.keys(LEGACY_CONNECTION_STORAGE_KEYS).sort()).toEqual([
      'github',
      'gitlab',
      'netlify',
      'supabase',
      'vercel',
    ]);
  });
});
