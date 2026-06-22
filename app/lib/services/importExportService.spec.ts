import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * js-cookie is a browser-only dependency. Provide a tiny in-memory real
 * implementation (a standard test double, not a behavioural mock) so the
 * service runs under the node test environment without a DOM.
 */
const cookieStore: Record<string, string> = {};
vi.mock('js-cookie', () => ({
  default: {
    get: (key?: string) => (key === undefined ? { ...cookieStore } : cookieStore[key]),
    set: (key: string, value: string) => {
      cookieStore[key] = value;
    },
    remove: (key: string) => {
      delete cookieStore[key];
    },
  },
}));

// Snapshots are read from IndexedDB; stub the persistence layer to a no-op.
vi.mock('~/lib/persistence/db', () => ({
  openDatabase: async () => null,
  getAllSnapshots: async () => [],
  setSnapshot: async () => {},
  deleteSnapshot: async () => {},
}));
vi.mock('~/lib/persistence/chats', () => ({
  getAllChats: async () => [],
  deleteChat: async () => {},
}));

import { ImportExportService } from './importExportService';

/** Minimal in-memory localStorage implementation for the node test env. */
class MemoryStorage {
  private _store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this._store).length;
  }

  key(i: number): string | null {
    return Object.keys(this._store)[i] ?? null;
  }

  getItem(key: string): string | null {
    return key in this._store ? this._store[key] : null;
  }

  setItem(key: string, value: string): void {
    this._store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this._store[key];
  }
}

describe('ImportExportService.exportSettings secret redaction', () => {
  beforeEach(() => {
    for (const k of Object.keys(cookieStore)) {
      delete cookieStore[k];
    }

    (globalThis as any).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
  });

  it('redacts the Netlify deploy token nested under netlify_connection in the raw dump', async () => {
    localStorage.setItem(
      'netlify_connection',
      JSON.stringify({ user: { id: 'u1', full_name: 'Ada' }, token: 'nfp_supersecretdeploytoken' }),
    );

    const settings = await ImportExportService.exportSettings();
    const rawDump = JSON.stringify(settings._raw.localStorage);

    // The plaintext token must not survive into the exported backup.
    expect(rawDump).not.toContain('nfp_supersecretdeploytoken');
    expect(settings._raw.localStorage.netlify_connection.token).toBe('[REDACTED]');

    // Non-secret fields are preserved so the backup remains useful.
    expect(settings._raw.localStorage.netlify_connection.user.full_name).toBe('Ada');
  });

  it('redacts credentials nested under a non-secret-named key (provider_settings)', async () => {
    localStorage.setItem('provider_settings', JSON.stringify({ OpenAI: { enabled: true, apiKey: 'sk-leakedkey123' } }));

    const settings = await ImportExportService.exportSettings();
    const rawDump = JSON.stringify(settings._raw.localStorage);

    expect(rawDump).not.toContain('sk-leakedkey123');
    expect(settings._raw.localStorage.provider_settings.OpenAI.apiKey).toBe('[REDACTED]');
    expect(settings._raw.localStorage.provider_settings.OpenAI.enabled).toBe(true);
  });

  it('redacts secrets inside arrays of objects', async () => {
    localStorage.setItem(
      'connections',
      JSON.stringify([
        { name: 'a', token: 'tok-aaa' },
        { name: 'b', secret: 'sec-bbb' },
      ]),
    );

    const settings = await ImportExportService.exportSettings();
    const rawDump = JSON.stringify(settings._raw.localStorage);

    expect(rawDump).not.toContain('tok-aaa');
    expect(rawDump).not.toContain('sec-bbb');
    expect(settings._raw.localStorage.connections[0].token).toBe('[REDACTED]');
    expect(settings._raw.localStorage.connections[1].secret).toBe('[REDACTED]');
    expect(settings._raw.localStorage.connections[0].name).toBe('a');
  });

  it('redacts top-level secret-named cookies', async () => {
    cookieStore.apiKeys = JSON.stringify({ OpenAI: 'sk-cookiekey' });
    cookieStore.theme = 'dark';

    const settings = await ImportExportService.exportSettings();

    expect(settings._raw.cookies.apiKeys).toBe('[REDACTED]');
    expect(settings._raw.cookies.theme).toBe('dark');
  });
});
