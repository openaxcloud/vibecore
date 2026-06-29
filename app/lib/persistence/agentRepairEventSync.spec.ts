import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAgentRepairEvents, recordAgentRepairEvent } from './agentRepairEventSync';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('agentRepairEventSync', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
  });

  describe('fetchAgentRepairEvents', () => {
    it('hits the project-scoped endpoint with the limit + credentials and returns the events', async () => {
      const event = { id: 'evt-1', projectId: 'proj-1', relativePath: 'src/App.tsx', attempt: 1, outcome: 'repaired' };
      fetchMock.mockResolvedValueOnce(jsonResponse({ events: [event] }));

      const result = await fetchAgentRepairEvents('proj-1', 50);

      expect(result).toEqual([event]);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/proj-1/agent-repair-events?limit=50',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    it('returns an empty array on non-OK responses without throwing', async () => {
      fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

      await expect(fetchAgentRepairEvents('proj-1')).resolves.toEqual([]);
      expect(logSpy).toHaveBeenCalled();
    });

    it('returns an empty array when the network throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));

      await expect(fetchAgentRepairEvents('proj-1')).resolves.toEqual([]);
      expect(logSpy).toHaveBeenCalled();
    });

    it('encodes the projectId so a slash or space cannot escape the route', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ events: [] }));

      await fetchAgentRepairEvents('proj/with space');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/proj%2Fwith%20space/agent-repair-events?limit=100',
        expect.anything(),
      );
    });
  });

  describe('recordAgentRepairEvent', () => {
    it('POSTs the event with JSON headers and the full payload', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ event: { id: 'evt-1' } }));

      await recordAgentRepairEvent('proj-1', {
        relativePath: 'src/App.tsx',
        outcome: 'failed',
        attempt: 2,
        validationError: 'Unexpected token',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/projects/proj-1/agent-repair-events');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');

      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        relativePath: 'src/App.tsx',
        outcome: 'failed',
        attempt: 2,
        validationError: 'Unexpected token',
      });
    });

    it('swallows network errors after logging — persistence is best-effort', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));

      await expect(
        recordAgentRepairEvent('proj-1', { relativePath: 'a.ts', outcome: 'gave_up' }),
      ).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
    });

    it('logs but does not throw on a non-OK response', async () => {
      fetchMock.mockResolvedValueOnce(new Response('nope', { status: 403 }));

      await expect(
        recordAgentRepairEvent('proj-1', { relativePath: 'a.ts', outcome: 'repaired', attempt: 1 }),
      ).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
