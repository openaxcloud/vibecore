import { describe, expect, it, vi } from 'vitest';
import { buildImageContextFromRevision, type AppBuildRunPayload } from './server-deploy-revision.js';
import { serverDeployContextObjectKey, serverDeployRevisionObjectKey } from './server-deploy-transfer.js';
import type { SnapshotAgent } from './server-deploy-transfer.js';

const SHA = 'e'.repeat(64);

/** Agent whose revision step reports bytes + sha like the real pod script does. */
function revisionAgent(): SnapshotAgent {
  return {
    runStep: vi.fn(async ({ onLine }: { onLine?: (l: 'info' | 'error', s: string) => void }) => {
      onLine?.('info', `[revision] 1000 bytes sha256=${SHA}`);

      return { exitCode: 0, timedOut: false };
    }),
    readFile: vi.fn(async () => ({ content: '', encoding: 'utf8' as const })),
  } as unknown as SnapshotAgent;
}

function storage() {
  return {
    active: true,
    ensureBucket: vi.fn(async () => ({ bucket: 'vc-proj1', created: false, location: 'EU' })),
    createUploadUrl: vi.fn(async (_p: string, input: { key: string }) => ({
      url: `https://signed.example/put/${input.key}`,
      headers: { 'Content-Type': 'application/gzip' },
    })),
    createDownloadUrl: vi.fn(async (_p: string, input: { key: string }) => ({
      url: `https://signed.example/get/${input.key}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    })),
  };
}

const baseOpts = (over: Partial<Parameters<typeof buildImageContextFromRevision>[0]> = {}) => ({
  agent: revisionAgent(),
  deploymentId: 'dep1',
  projectId: 'proj1',
  orgId: 'org1',
  objectStorage: storage(),
  image: 'vibecore/workspace-agent:2026.04.0',
  installCommand: 'npm install --include=dev',
  buildCommand: 'npm run build' as string | null,
  timeoutSeconds: 300,
  runAppBuild: vi.fn(async () => ({ exitCode: 0, output: '[build] uploaded artifact\n', timedOut: false, phase: 'Succeeded' })),
  ...over,
});

describe('buildImageContextFromRevision', () => {
  it('captures the revision, runs the isolated build, and returns the SAME context contract as the pod snapshot', async () => {
    const opts = baseOpts();
    const result = await buildImageContextFromRevision(opts);

    expect(result.ok).toBe(true);
    expect(result.bucket).toBe('vc-proj1');
    expect(result.object).toBe(serverDeployContextObjectKey('dep1'));
    expect(result.revisionObject).toBe(serverDeployRevisionObjectKey('dep1'));
    expect(result.revisionSha256).toBe(SHA);

    const payload = (opts.runAppBuild as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppBuildRunPayload;
    expect(payload.revisionUrl).toContain(`get/${serverDeployRevisionObjectKey('dep1')}`);
    expect(payload.artifactUrl).toContain(`put/${serverDeployContextObjectKey('dep1')}`);
    expect(payload.revisionSha256).toBe(SHA);
    expect(payload.buildCommand).toBe('npm install --include=dev && npm run build');
    expect(payload.timeoutSeconds).toBe(300);
  });

  it('composes install-only when the app has no build step', async () => {
    const opts = baseOpts({ buildCommand: null });
    await buildImageContextFromRevision(opts);

    const payload = (opts.runAppBuild as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppBuildRunPayload;
    expect(payload.buildCommand).toBe('npm install --include=dev');
  });

  it('fails typed when the isolated build fails, surfacing the pod log', async () => {
    const lines: string[] = [];
    const opts = baseOpts({
      runAppBuild: vi.fn(async () => ({ exitCode: 1, output: 'npm ERR! boom\n', timedOut: false, phase: 'Failed' })),
      onLog: (_l: 'info' | 'error', line: string) => lines.push(line),
    });
    const result = await buildImageContextFromRevision(opts);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('exit 1');
    expect(lines.join('\n')).toContain('npm ERR! boom');
  });

  it('fails typed on build timeout', async () => {
    const result = await buildImageContextFromRevision(
      baseOpts({
        runAppBuild: vi.fn(async () => ({ exitCode: 124, output: '', timedOut: true, phase: 'Running' })),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('timed out');
  });

  it('propagates a failed revision snapshot as-is', async () => {
    const agent = {
      runStep: vi.fn(async () => ({ exitCode: 1, timedOut: false })),
      readFile: vi.fn(async () => ({ content: '', encoding: 'utf8' as const })),
    } as unknown as SnapshotAgent;

    const opts = baseOpts({ agent });
    const result = await buildImageContextFromRevision(opts);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('SNAPSHOT_FAILED');
    expect(opts.runAppBuild).not.toHaveBeenCalled();
  });
});
