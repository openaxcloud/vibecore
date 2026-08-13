import { describe, expect, it, beforeEach } from 'vitest';

import { action, __testing } from './api.logs.ingest';
import { toResponse } from '~/lib/test/rr7-data';

function buildRequest(body: unknown, init: RequestInit = {}) {
  return new Request('http://localhost/api/logs/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
    ...init,
  });
}

describe('/api/logs/ingest', () => {
  beforeEach(() => {
    __testing.recentFrontendLogs.length = 0;
    __testing.rateLimitStore.clear();
  });

  it('accepts a valid frontend telemetry batch', async () => {
    const response = toResponse(
      await action({
        request: buildRequest({
          sessionId: 'session-1',
          pageUrl: 'http://localhost/',
          logs: [
            {
              level: 'info',
              message: 'Telemetry initialized',
              timestamp: new Date().toISOString(),
              source: 'frontend',
              category: 'action',
            },
          ],
        }),
        context: {},
        params: {},
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ success: true, processed: 1 });
    expect(__testing.recentFrontendLogs).toHaveLength(1);
    expect(__testing.recentFrontendLogs[0]).toMatchObject({
      message: 'Telemetry initialized',
      sessionId: 'session-1',
      pageUrl: 'http://localhost/',
      clientIp: '203.0.113.10',
    });
  });

  it('rejects malformed telemetry events', async () => {
    const response = toResponse(
      await action({
        request: buildRequest({ logs: [{ level: 'fatal', message: '' }] }),
        context: {},
        params: {},
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid log format' });
    expect(__testing.recentFrontendLogs).toHaveLength(0);
  });
});
