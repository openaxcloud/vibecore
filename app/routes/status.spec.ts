/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loader } from './status';

type ProbeOutcome =
  | { kind: 'ok' }
  | { kind: 'slow-fail'; status: number }
  | { kind: 'abort' }
  | { kind: 'reject'; message: string };

function setupFetch(byUrl: Map<string, ProbeOutcome>) {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const outcome = byUrl.get(url) ?? { kind: 'ok' };

    if (outcome.kind === 'abort') {
      if (init?.signal) {
        await new Promise<void>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }

      throw new Error('aborted'); // safety net if signal never fires
    }

    if (outcome.kind === 'reject') {
      throw new Error(outcome.message);
    }

    if (outcome.kind === 'slow-fail') {
      return new Response('boom', { status: outcome.status });
    }

    return new Response('{"status":"ok"}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchSpy);

  return fetchSpy;
}

function buildArgs(): Parameters<typeof loader>[0] {
  const request = new Request('http://app.e-code.ai/status');
  return {
    request,
    params: {},
    context: {} as Parameters<typeof loader>[0]['context'],
  };
}

const ORIGINAL_TIMEOUT = process.env.STATUS_PROBE_TIMEOUT_MS;

beforeEach(() => {
  /*
   * Keep probes snappy in tests; the loader caches this only at module load,
   * so we re-import in a fresh module graph below for the abort scenario.
   */
  process.env.STATUS_PROBE_TIMEOUT_MS = '50';
});

afterEach(() => {
  if (ORIGINAL_TIMEOUT === undefined) {
    delete (process.env as Record<string, string | undefined>).STATUS_PROBE_TIMEOUT_MS;
  } else {
    process.env.STATUS_PROBE_TIMEOUT_MS = ORIGINAL_TIMEOUT;
  }

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('status route loader', () => {
  it('reports overall operational when every probe returns 2xx', async () => {
    setupFetch(new Map());

    const response = await loader(buildArgs());
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('cache-control')).toContain('no-store');

    const payload = (await (response as Response).json()) as {
      overall: string;
      components: Array<{ key: string; label: string; status: string; responseTimeMs: number | null; message: string }>;
    };
    expect(payload.overall).toBe('operational');
    expect(payload.components).toHaveLength(5); // web (self) + 4 probed targets

    const labels = payload.components.map((c: { label: string }) => c.label);
    expect(labels).toEqual(['Dashboard', 'API', 'AI gateway', 'Workspace runtime', 'Preview proxy']);
    expect(payload.components[0].status).toBe('operational');
    expect(payload.components[1].status).toBe('operational');
  });

  it('marks a component degraded when its /health returns a non-2xx', async () => {
    const apiUrl = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001/health';
    setupFetch(new Map([[apiUrl, { kind: 'slow-fail', status: 503 }]]));

    const response = await loader(buildArgs());

    const payload = (await (response as Response).json()) as {
      overall: string;
      components: Array<{ key: string; label: string; status: string; responseTimeMs: number | null; message: string }>;
    };

    expect(payload.overall).toBe('degraded');

    const api = payload.components.find((c) => c.key === 'api');
    expect(api?.status).toBe('degraded');
    expect(api?.message).toContain('HTTP 503');
  });

  it('marks a component down when fetch rejects outright', async () => {
    const wsmUrl = 'http://vibecore-vibecore-platform-workspace-manager.vibecore.svc.cluster.local:3020/health';
    setupFetch(new Map([[wsmUrl, { kind: 'reject', message: 'ECONNREFUSED' }]]));

    const response = await loader(buildArgs());

    const payload = (await (response as Response).json()) as {
      overall: string;
      components: Array<{ key: string; label: string; status: string; responseTimeMs: number | null; message: string }>;
    };

    expect(payload.overall).toBe('down');

    const wsm = payload.components.find((c) => c.key === 'workspace-manager');
    expect(wsm?.status).toBe('down');
    expect(wsm?.responseTimeMs).toBeNull();
    expect(wsm?.message).toContain('ECONNREFUSED');
  });
});
