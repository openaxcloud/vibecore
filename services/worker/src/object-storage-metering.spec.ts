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

describe('triggerObjectStorageMetering', () => {
  it('throws when no API base URL is configured so the CronJob fails loudly', async () => {
    const { triggerObjectStorageMetering } = await import('./index.js');
    await expect(triggerObjectStorageMetering({})).rejects.toThrowError(/API_INTERNAL_URL, API_URL, SAAS_API_URL or API_BASE_URL is required/);
  });

  it('POSTs to /internal/metering/object-storage with the internal secret', async () => {
    process.env.API_INTERNAL_URL = 'http://api.test:3001';
    process.env.INTERNAL_API_SHARED_SECRET = 'sekret';

    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ kind: 'object-storage-sweep', shadow: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerObjectStorageMetering } = await import('./index.js');
    const result = await triggerObjectStorageMetering({});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://api.test:3001/internal/metering/object-storage');
    expect(call[1].method).toBe('POST');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer sekret');
    expect(result).toMatchObject({ kind: 'object-storage-sweep' });
  });

  it('forwards per-job overrides (shadow / daysInPeriod) in the body', async () => {
    process.env.API_URL = 'http://api.test:3001';

    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerObjectStorageMetering } = await import('./index.js');
    await triggerObjectStorageMetering({ shadow: false, daysInPeriod: 31 });

    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toEqual({ shadow: false, daysInPeriod: 31 });
  });

  it('throws when the api replies non-2xx so BullMQ retries', async () => {
    process.env.API_URL = 'http://api.test:3001';

    const fetchSpy = vi.fn(async () => new Response('boom', { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { triggerObjectStorageMetering } = await import('./index.js');
    await expect(triggerObjectStorageMetering({})).rejects.toThrowError(/metering.objectStorage upstream failed: 503/);
  });
});
