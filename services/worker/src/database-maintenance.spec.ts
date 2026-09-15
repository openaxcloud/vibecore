import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = ['API_INTERNAL_URL', 'API_URL', 'INTERNAL_API_SHARED_SECRET', 'WORKSPACE_MANAGER_SHARED_SECRET'];
const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    ORIGINAL[key] = process.env[key];
    delete (process.env as Record<string, string | undefined>)[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL[key] === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      process.env[key] = ORIGINAL[key];
    }
  }

  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('triggerDatabaseMaintenance', () => {
  it('throws when no API base URL is configured', async () => {
    const { triggerDatabaseMaintenance } = await import('./index.js');
    await expect(triggerDatabaseMaintenance({})).rejects.toThrowError(/API_INTERNAL_URL, API_URL, SAAS_API_URL or API_BASE_URL is required/);
  });

  it('POSTs to /internal/database-maintenance with the internal secret', async () => {
    process.env.API_INTERNAL_URL = 'http://api.test:3001';
    process.env.INTERNAL_API_SHARED_SECRET = 'sekret';

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ skipped: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerDatabaseMaintenance } = await import('./index.js');
    const result = await triggerDatabaseMaintenance({});

    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://api.test:3001/internal/database-maintenance');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer sekret');
    expect(result).toMatchObject({ skipped: true });
  });

  it('throws on non-2xx so BullMQ retries', async () => {
    process.env.API_URL = 'http://api.test:3001';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));

    const { triggerDatabaseMaintenance } = await import('./index.js');
    await expect(triggerDatabaseMaintenance({})).rejects.toThrowError(/database.maintenance upstream failed: 503/);
  });
});
