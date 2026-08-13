/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action, billingDisplayLabel, formatEuro, spendUsageState } from './billing';
import { toResponse } from '~/lib/test/rr7-data';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL'] as const;

describe('spendUsageState — tone derives from the raw ratio, not the rounded pct', () => {
  it('returns no-cap state when the cap is null, undefined or <= 0', () => {
    expect(spendUsageState(500, null)).toEqual({ tone: 'none', pct: 0 });
    expect(spendUsageState(500, undefined)).toEqual({ tone: 'none', pct: 0 });
    expect(spendUsageState(500, 0)).toEqual({ tone: 'none', pct: 0 });
    expect(spendUsageState(500, -100)).toEqual({ tone: 'none', pct: 0 });
  });

  it('does NOT report "reached" in the 99.5–99.99% band (the rounding bug)', () => {
    /*
     * spent=995, cap=1000 → raw ratio 99.5%. The server gate is `995 >= 1000` = false,
     * so services are NOT paused. Tone must stay 'critical', not 'reached'.
     */
    const { tone, pct } = spendUsageState(995, 1000);
    expect(tone).toBe('critical');

    // The displayed/bar pct still rounds to 100 for the label.
    expect(pct).toBe(100);

    expect(spendUsageState(9999, 10000).tone).toBe('critical');
  });

  it('reports "reached" only when spent >= cap (matching the server `spent >= cap`)', () => {
    expect(spendUsageState(1000, 1000).tone).toBe('reached');
    expect(spendUsageState(1500, 1000).tone).toBe('reached');
    expect(spendUsageState(999, 1000).tone).toBe('critical');
  });

  it('does not fire "critical"/"warn" a half-percent early', () => {
    // 79.5% rounds to 80 but raw ratio < 0.8 → stays 'warn', not 'critical'.
    expect(spendUsageState(795, 1000).tone).toBe('warn');
    expect(spendUsageState(800, 1000).tone).toBe('critical');

    // 49.5% rounds to 50 but raw ratio < 0.5 → stays 'ok', not 'warn'.
    expect(spendUsageState(495, 1000).tone).toBe('ok');
    expect(spendUsageState(500, 1000).tone).toBe('warn');
  });

  it('clamps the displayed pct to 0..100 while keeping the right tone', () => {
    expect(spendUsageState(0, 1000)).toEqual({ tone: 'ok', pct: 0 });
    expect(spendUsageState(2000, 1000)).toEqual({ tone: 'reached', pct: 100 });
  });
});

describe('billing display language', () => {
  it('uses one EUR formatter for every visible amount', () => {
    expect(formatEuro(0)).toBe('€0.00');
    expect(formatEuro(123456)).toBe('€1,234.56');
  });

  it('maps technical usage keys to customer-facing labels', () => {
    expect(billingDisplayLabel('projects.count')).toBe('Projects');
    expect(billingDisplayLabel('ai.input_tokens')).toBe('AI input tokens');
    expect(billingDisplayLabel('CUSTOM_API_CALLS')).toBe('Custom API calls');
  });
});

function actionRequest(body: Record<string, string>, cookie = 'vc_session=token'): Request {
  return new Request('http://localhost/billing', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(body).toString(),
  });
}

const args = (request: Request) => ({ request, params: {}, context: {} }) as unknown as Parameters<typeof action>[0];

describe('billing action — set-limits rejects a $0 cap (silently blocks all PAYG)', () => {
  let originals: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    originals = {};

    for (const key of ENV_KEYS) {
      originals[key] = process.env[key];
    }

    delete process.env.SAAS_API_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    for (const key of ENV_KEYS) {
      const value = originals[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        (process.env as Record<string, string>)[key] = value;
      }
    }
  });

  function stubFetch(calls: string[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = typeof url === 'string' ? url : url.toString();
        calls.push(`${init?.method ?? 'GET'} ${href}`);

        const jsonHeaders = { 'content-type': 'application/json' };

        if (href.endsWith('/orgs')) {
          return new Response(JSON.stringify({ organizations: [{ id: 'org1' }] }), {
            status: 200,
            headers: jsonHeaders,
          });
        }

        if (href.endsWith('/credits/limits')) {
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
        }

        return new Response('not found', { status: 404 });
      }),
    );
  }

  it('rejects a literal $0 cap with 400 and never POSTs it to the server', async () => {
    const calls: string[] = [];
    stubFetch(calls);

    const response = toResponse(await action(args(actionRequest({ intent: 'set-limits', budgetCapDollars: '0' }))));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/blank|0\.01|credits/i);
    expect(calls.some((c) => c.includes('/credits/limits'))).toBe(false);
  });

  it('accepts a blank cap as "no cap" (null) and POSTs it', async () => {
    const calls: string[] = [];
    stubFetch(calls);

    const response = toResponse(await action(args(actionRequest({ intent: 'set-limits', budgetCapDollars: '' }))));

    expect(response.status).toBe(200);
    expect(calls.some((c) => c.includes('POST') && c.includes('/credits/limits'))).toBe(true);
  });

  it('accepts the documented $0.01 minimum (restrict to credits)', async () => {
    const calls: string[] = [];
    stubFetch(calls);

    const response = toResponse(await action(args(actionRequest({ intent: 'set-limits', budgetCapDollars: '0.01' }))));

    expect(response.status).toBe(200);
    expect(calls.some((c) => c.includes('POST') && c.includes('/credits/limits'))).toBe(true);
  });
});
