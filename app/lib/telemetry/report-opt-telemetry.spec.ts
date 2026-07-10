import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportOptTelemetry } from './report-opt-telemetry';

describe('reportOptTelemetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the event to /api/telemetry with keepalive', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);

    reportOptTelemetry({ type: 'diff-edit-apply', estimatedTokensSaved: 1234, outcome: 'applied' });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/telemetry');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string)).toMatchObject({ type: 'diff-edit-apply', estimatedTokensSaved: 1234 });
  });

  it('never throws when fetch rejects (offline)', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect(() => reportOptTelemetry({ type: 'diff-edit-apply' })).not.toThrow();
  });

  it('is a no-op when fetch is unavailable (SSR)', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => reportOptTelemetry({ type: 'context-optimization' })).not.toThrow();
  });
});
