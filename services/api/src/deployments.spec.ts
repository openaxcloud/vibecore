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

  it('keeps the provider summary lines for non-server providers', () => {
    const messages = logsFor('static');

    expect(messages.join('\n')).toContain('Static export');
    expect(messages.join('\n')).toContain('Deployment ready:');
  });
});
