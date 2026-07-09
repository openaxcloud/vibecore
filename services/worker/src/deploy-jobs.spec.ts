import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerDeployBuild, triggerDeployReap } from './deploy-jobs.js';

const ENV_KEYS = [
  'API_INTERNAL_URL',
  'API_URL',
  'SAAS_API_URL',
  'API_BASE_URL',
  'INTERNAL_API_SHARED_SECRET',
  'WORKSPACE_MANAGER_SHARED_SECRET',
];

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

describe('triggerDeployBuild', () => {
  it('throws when no API base URL is configured', async () => {
    await expect(triggerDeployBuild({})).rejects.toThrowError(/API_INTERNAL_URL.* is required/);
  });

  it('uses SAAS_API_URL (the reachable :3001 internal Service URL) in prod', async () => {
    process.env.SAAS_API_URL = 'http://api.svc.cluster.local:3001';
    process.env.WORKSPACE_MANAGER_SHARED_SECRET = 'wms';

    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ deployment: { status: 'READY' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await triggerDeployBuild({ deploymentId: 'd1' });

    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://api.svc.cluster.local:3001/internal/deployments/build');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer wms');
  });

  it('prefers SAAS_API_URL over the dead API_BASE_URL (:80 has no api listener in prod)', async () => {
    process.env.SAAS_API_URL = 'http://api.svc.cluster.local:3001';
    process.env.API_BASE_URL = 'http://api.svc:80';

    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await triggerDeployBuild({ deploymentId: 'd1' });

    expect((fetchSpy.mock.calls[0] as unknown as [string])[0]).toBe(
      'http://api.svc.cluster.local:3001/internal/deployments/build',
    );
  });

  it('POSTs the job payload to /internal/deployments/build with the internal secret', async () => {
    process.env.API_INTERNAL_URL = 'http://api.test:3001';
    process.env.INTERNAL_API_SHARED_SECRET = 'sekret';

    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ deployment: { status: 'READY' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const jobData = { projectId: 'p1', deploymentId: 'd1', userId: 'u1', buildInput: { provider: 'static' } };
    const result = await triggerDeployBuild(jobData);

    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://api.test:3001/internal/deployments/build');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer sekret');
    expect(JSON.parse(String(call[1].body))).toMatchObject(jobData);
    expect(result).toMatchObject({ deployment: { status: 'READY' } });
  });

  it('throws on non-2xx so BullMQ retries', async () => {
    process.env.API_URL = 'http://api.test:3001';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );

    await expect(triggerDeployBuild({})).rejects.toThrowError(/deploy.build upstream failed: 503/);
  });
});

describe('triggerDeployReap', () => {
  it('POSTs to /internal/deployments/reap with the internal secret', async () => {
    process.env.API_INTERNAL_URL = 'http://api.test:3001';
    process.env.INTERNAL_API_SHARED_SECRET = 'sekret';

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ scanned: 2, failed: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await triggerDeployReap({});

    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://api.test:3001/internal/deployments/reap');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer sekret');
    expect(result).toMatchObject({ scanned: 2, failed: 1 });
  });

  it('throws on non-2xx so BullMQ retries', async () => {
    process.env.API_URL = 'http://api.test:3001';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );

    await expect(triggerDeployReap({})).rejects.toThrowError(/deploy.reap upstream failed: 500/);
  });
});
