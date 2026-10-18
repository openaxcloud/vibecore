import type { LoaderFunctionArgs } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loader as monitoring } from './api.monitoring.health';
import { loader as benchmark } from './api.polyglot.benchmark';
import { loader as polyglot } from './api.polyglot.health';
import { loader as status } from './api.status';
import { loader as incidents } from './api.status.incidents';
import { loader as maintenance } from './api.status.maintenance';
import { loader as metrics } from './api.status.metrics';
import { loader as services } from './api.status.services';
import { loader as uptime } from './api.status.uptime';
import { toResponse } from '~/lib/test/rr7-data';

const routes = [
  ['status', status],
  ['status/services', services],
  ['status/incidents', incidents],
  ['status/maintenance', maintenance],
  ['status/metrics', metrics],
  ['status/uptime', uptime],
  ['polyglot/health', polyglot],
  ['polyglot/benchmark', benchmark],
  ['monitoring/health', monitoring],
] as const;

function requestArgs(path: string, language: string): LoaderFunctionArgs {
  return {
    request: new Request(`https://e-code.ai/api/${path}?range=7d`, {
      headers: { 'Accept-Language': language },
    }),
    params: {},
    context: {},
  };
}

describe.each(['en', 'fr'])('public telemetry without an observation source (%s)', (language) => {
  it.each(routes)('%s rejects an unmeasured success and carries localized unavailability', async (path, loader) => {
    const response = toResponse(await loader(requestArgs(path, language)));
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Language')).toBe(language);
    expect(response.headers.get('Vary')).toContain('Accept-Language');

    for (const result of Array.isArray(payload) ? payload : [payload]) {
      expect(result).toMatchObject({
        status: 'unknown',
        code: 'PUBLIC_TELEMETRY_UNAVAILABLE',
        telemetryAvailable: false,
        observedAt: null,
      });
      expect(result.message).toContain(language === 'fr' ? 'télémétrie' : 'telemetry');
    }
    expect(JSON.stringify(payload)).not.toMatch(/"(?:healthy|operational)"|99\.9|20\d\d-\d\d-\d\dT/);
  });

  it('keeps unobserved counts, timings and histories null instead of claiming zero or an empty history', async () => {
    const body = async (loader: (typeof routes)[number][1]) =>
      toResponse(await loader(requestArgs('status', language))).json();
    expect(await body(metrics)).toMatchObject({
      uptime: null,
      uptime24h: null,
      uptime7d: null,
      uptime30d: null,
      response_time: null,
      active_incidents: null,
      services_operational: null,
    });
    expect(await body(incidents)).toMatchObject({ incidents: null });
    expect(await body(maintenance)).toMatchObject({ maintenance: null });
    expect(await body(monitoring)).toMatchObject({ metrics: null, checks: null });
    expect(await body(benchmark)).toMatchObject({ fastest: null, results: null, timestamp: null });

    const uptimeBody = await toResponse(await uptime(requestArgs('status/uptime', language))).json();
    expect(uptimeBody).toMatchObject({ uptime: null, metrics: null, range: '7d' });

    const serviceBody = await body(services);
    expect(serviceBody.length).toBeGreaterThan(0);

    for (const service of serviceBody) {
      expect(service).toMatchObject({ uptime: null, responseTime: null, lastChecked: null, affectedRegions: null });
    }

    for (const service of (await body(polyglot)).services) {
      expect(service).toMatchObject({ status: 'unknown', responseTime: null, lastCheck: null });
    }
  });
});
