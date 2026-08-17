import { hashPassword } from '@vibecore/auth';
import { createPrometheusRegistry } from '@vibecore/observability';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/*
 * Boot the API with a SHARED observability registry so the test can record a few
 * known metrics directly and then assert the /admin/platform-metrics endpoint
 * exposes them as the structured JSON the admin Monitoring dashboard consumes.
 * This is the exact same registry the /metrics text route renders — no mocks.
 */
async function setup() {
  const store = new TestApiStore();
  const metricsRegistry = createPrometheusRegistry();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), metricsRegistry });

  const admin = await store.createUser({
    email: 'metrics-admin@example.com',
    name: 'Metrics Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  // Platform admins must have MFA enrolled to hit /admin/* (ADMIN_MFA_REQUIRED default).
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });

  const member = await store.createUser({
    email: 'metrics-member@example.com',
    name: 'Member',
    passwordHash: hashPassword('password123'),
  });
  await store.createSession({ userId: member.id, token: 'member-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, metricsRegistry };
}

describe('GET /admin/platform-metrics', () => {
  it('requires platform admin', async () => {
    const { app } = await setup();

    const anon = await app.inject({ method: 'GET', url: '/admin/platform-metrics' });
    expect(anon.statusCode).toBe(401);

    const member = await app.inject({
      method: 'GET',
      url: '/admin/platform-metrics',
      headers: auth('member-token'),
    });
    expect(member.statusCode).toBe(403);

    await app.close();
  });

  it('returns the structured registry snapshot with recorded values', async () => {
    const { app, metricsRegistry } = await setup();

    // Record a few known metrics across the metric families the dashboard surfaces.
    metricsRegistry.increment('workspace_starts_total', { outcome: 'success' }, 5);
    metricsRegistry.increment('workspace_failures_total', { reason: 'timeout' }, 2);
    metricsRegistry.increment('workspace_runtime_reseed_total', { reason: 'reconciled-from-persisted' });
    metricsRegistry.setGauge('queue_depth', { queue: 'builds' }, 7);
    metricsRegistry.increment('api_errors_total', { type: 'validation' }, 3);
    metricsRegistry.increment('ai_tokens_total', { provider: 'openai' }, 1200);
    metricsRegistry.observe('api_request_duration_seconds', { route: '/health' }, 0.02);
    metricsRegistry.observe('api_request_duration_seconds', { route: '/health' }, 0.4);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/platform-metrics',
      headers: auth('admin-token'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(typeof body.generatedAt).toBe('string');
    expect(Array.isArray(body.metrics)).toBe(true);

    const byName = new Map<string, any>(body.metrics.map((m: any) => [m.name, m]));

    // Counter with a recorded value + per-label breakdown.
    const starts = byName.get('workspace_starts_total');
    expect(starts).toBeDefined();
    expect(starts.type).toBe('counter');
    expect(starts.empty).toBe(false);
    expect(starts.total).toBe(5);
    expect(starts.samples).toEqual([{ labels: { outcome: 'success' }, value: 5 }]);

    const failures = byName.get('workspace_failures_total');
    expect(failures.total).toBe(2);
    expect(failures.samples[0].labels).toEqual({ reason: 'timeout' });

    /*
     * Regression: runtime reseed reconciliation must remain observable without
     * throwing `Unknown metric` after a real cold start.
     */
    const reseeds = byName.get('workspace_runtime_reseed_total');
    expect(reseeds.total).toBe(1);
    expect(reseeds.samples).toEqual([{ labels: { reason: 'reconciled-from-persisted' }, value: 1 }]);

    // Gauge.
    const queue = byName.get('queue_depth');
    expect(queue.type).toBe('gauge');
    expect(queue.samples).toEqual([{ labels: { queue: 'builds' }, value: 7 }]);

    // Error counter.
    expect(byName.get('api_errors_total').total).toBe(3);

    // AI tokens.
    expect(byName.get('ai_tokens_total').total).toBe(1200);

    // Histogram with buckets + estimated quantiles + mean.
    const latency = byName.get('api_request_duration_seconds');
    expect(latency.type).toBe('histogram');
    expect(latency.empty).toBe(false);
    expect(latency.histograms).toHaveLength(1);
    const hist = latency.histograms[0];
    expect(hist.count).toBe(2);
    expect(hist.sum).toBeCloseTo(0.42, 5);
    expect(hist.avg).toBeCloseTo(0.21, 5);
    expect(Array.isArray(hist.buckets)).toBe(true);
    expect(hist.buckets.length).toBeGreaterThan(0);
    expect(typeof hist.p50).toBe('number');
    expect(typeof hist.p95).toBe('number');

    // A defined-but-never-observed metric is present and flagged empty (dashboard "no data").
    const podFailures = byName.get('kubernetes_pod_failures_total');
    expect(podFailures).toBeDefined();
    expect(podFailures.empty).toBe(true);
    expect(podFailures.total).toBe(0);

    await app.close();
  });

  it('reflects the SAME registry that /metrics renders', async () => {
    const { app, metricsRegistry } = await setup();
    metricsRegistry.increment('preview_requests_total', {}, 4);

    const [json, text] = await Promise.all([
      app.inject({ method: 'GET', url: '/admin/platform-metrics', headers: auth('admin-token') }),
      app.inject({ method: 'GET', url: '/metrics' }),
    ]);

    const preview = (json.json().metrics as any[]).find((m) => m.name === 'preview_requests_total');
    expect(preview.total).toBe(4);
    expect(text.body).toContain('preview_requests_total 4');

    await app.close();
  });
});
