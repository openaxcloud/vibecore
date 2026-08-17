import { describe, expect, it } from 'vitest';
import { createDeploymentLogs } from './deployments.js';

const input = {
  envVars: {},
  injectSecrets: [],
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
} as unknown as Parameters<typeof createDeploymentLogs>[0];

const project = { name: 'proj' } as unknown as Parameters<typeof createDeploymentLogs>[2];

const logsFor = (provider: string) =>
  createDeploymentLogs(
    input,
    {
      provider,
      environment: 'preview',
      framework: 'node',
      url: 'https://d-x.preview.example',
    } as unknown as Parameters<typeof createDeploymentLogs>[1],
    project,
  ).map((entry) => entry.message);

describe('createDeploymentLogs', () => {
  it('never fabricates progress or readiness for a server deploy (BUG-DEPLOY-001)', () => {
    const messages = logsFor('server');

    // The real pipeline logs these as they ACTUALLY happen; queue-time copies
    // made a failed deploy read as live with a "ready" URL that 502s.
    expect(messages.join('\n')).not.toContain('applied Deployment + Service');
    expect(messages.join('\n')).not.toContain('Deployment ready:');
  });

  it('never announces readiness for a static deploy either, but keeps its summary line', () => {
    const messages = logsFor('static');

    expect(messages.join('\n')).toContain('Static export');

    /*
     * This assertion used to REQUIRE "Deployment ready:", freezing the same lie
     * BUG-DEPLOY-001 removed from server deploys. The static pipeline installs
     * and builds in the workspace pod AFTER queueing: two consecutive failed
     * deploys were measured live, each having already announced
     * "Déploiement ready: https://s-…/" — an address serving nothing.
     */
    expect(messages.join('\n')).not.toContain('Deployment ready:');
  });

  it('still gives an address for a provider that has no pipeline left to run', () => {
    const messages = logsFor('vercel');

    expect(messages.join('\n')).toContain('Deployment ready:');
  });
});

describe('createDeploymentLogs timestamps', () => {
  /*
   * The summary block is persisted at the END of the pipeline but describes the
   * QUEUE. Stamping it with "now" sorted it above every real build line, so the
   * Logs panel opened with the outcome and buried the build below it (proven
   * live 2026-08-06).
   */
  it('stamps the queue summary with the deployment start time, not the persist time', () => {
    const startedAt = '2026-08-06T14:42:41.000Z';

    const entries = createDeploymentLogs(
      input,
      {
        provider: 'static',
        environment: 'production',
        framework: 'vite',
        url: 'https://s-x.preview.example',
        startedAt,
        createdAt: startedAt,
      } as unknown as Parameters<typeof createDeploymentLogs>[1],
      project,
    );

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.timestamp === startedAt)).toBe(true);

    // A build line emitted mid-pipeline must sort AFTER the queue summary.
    const buildLine = { timestamp: '2026-08-06T14:42:43.807Z' };
    const sorted = [...entries, buildLine].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    expect(sorted[sorted.length - 1]).toBe(buildLine);
  });
});
