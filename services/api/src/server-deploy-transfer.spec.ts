import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from './object-storage.js';
import {
  buildServerDeployEnv,
  serverDeploySourceTarPath,
  snapshotWorkspaceAppSource,
  SERVER_DEPLOY_INLINE_TAR_LIMIT_BYTES,
  type SnapshotAgent,
} from './server-deploy-transfer.js';

/** A fake snapshot agent: tar succeeds and readFile returns a base64 payload. */
function fakeAgent(overrides: Partial<SnapshotAgent> = {}): SnapshotAgent {
  return {
    runStep: vi.fn(async () => ({ exitCode: 0, timedOut: false })),
    readFile: vi.fn(async () => ({
      content: Buffer.from('tarball-bytes').toString('base64'),
      encoding: 'base64' as const,
    })),
    ...overrides,
  };
}

describe('snapshotWorkspaceAppSource', () => {
  it('tars the source (excluding node_modules/.git) and inlines it when there is no object storage', async () => {
    const calls: { command: string; args: string[]; cwd: string }[] = [];
    const agent = fakeAgent({
      runStep: vi.fn(async ({ command, args, cwd }: { command: string; args: string[]; cwd: string }) => {
        calls.push({ command, args, cwd });

        return { exitCode: 0, timedOut: false };
      }),
    });

    const result = await snapshotWorkspaceAppSource({ agent, deploymentId: 'dep1' });

    expect(result.ok).toBe(true);
    expect(result.transfer).toEqual({ kind: 'inline', base64: Buffer.from('tarball-bytes').toString('base64') });

    // tar ran in the workspace root, excluding node_modules and .git.
    expect(calls[0].command).toBe('sh');
    expect(calls[0].cwd).toBe('.');
    expect(calls[0].args[1]).toContain('--exclude=./node_modules');
    expect(calls[0].args[1]).toContain('--exclude=./.git');
    expect(calls[0].args[1]).toContain(serverDeploySourceTarPath('dep1'));

    // it pulled the tarball back out of the pod.
    expect(agent.readFile as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(serverDeploySourceTarPath('dep1'));
  });

  it('writes the tarball to a workspace-relative path (the agent 404s /tmp) and removes it after', async () => {
    const calls: { args: string[] }[] = [];
    const agent = fakeAgent({
      runStep: vi.fn(async ({ args }: { args: string[] }) => {
        calls.push({ args });

        return { exitCode: 0, timedOut: false };
      }),
    });

    await snapshotWorkspaceAppSource({ agent, deploymentId: 'dep1' });

    // The agent's /files/read only serves the workspace root, so the tar path must
    // be workspace-relative (a dotfile), NOT an absolute /tmp path.
    const tarPath = serverDeploySourceTarPath('dep1');
    expect(tarPath.startsWith('/')).toBe(false);
    expect(calls[0].args[1]).toContain(`tar czf ${tarPath}`);
    expect(calls[0].args[1]).toContain('--exclude=./.vibecore-src-*');

    // After the read, the tarball is removed from the user's workspace.
    const last = calls[calls.length - 1];
    expect(last.args[1]).toBe(`rm -f ${tarPath}`);
  });

  it('uploads to object storage and returns a signed URL when available', async () => {
    const putObject = vi.fn(async () => ({ key: 'tmp/server-deploy/dep2.tgz', size: 13 }));
    const createDownloadUrl = vi.fn(async () => ({
      url: 'https://signed.example/dep2.tgz',
      expiresAt: '2026-01-01T00:00:00Z',
    }));
    const objectStorage = { putObject, createDownloadUrl } as unknown as ObjectStorage;

    const result = await snapshotWorkspaceAppSource({
      agent: fakeAgent(),
      deploymentId: 'dep2',
      objectStorage,
      projectId: 'proj-1',
    });

    expect(result.ok).toBe(true);
    expect(result.transfer).toEqual({
      kind: 'objectStorage',
      url: 'https://signed.example/dep2.tgz',
      expiresAt: '2026-01-01T00:00:00Z',
    });
    expect(putObject).toHaveBeenCalledWith('proj-1', expect.objectContaining({ key: 'tmp/server-deploy/dep2.tgz' }));
  });

  it('falls back to inline transfer when object-storage signing fails', async () => {
    const objectStorage = {
      putObject: vi.fn(async () => ({ key: 'k', size: 1 })),
      createDownloadUrl: vi.fn(async () => {
        throw new Error('signBlob permission denied');
      }),
    } as unknown as ObjectStorage;

    const result = await snapshotWorkspaceAppSource({
      agent: fakeAgent(),
      deploymentId: 'dep3',
      objectStorage,
      projectId: 'proj-1',
    });

    expect(result.ok).toBe(true);
    expect(result.transfer?.kind).toBe('inline');
  });

  it('rejects an app whose inline tarball exceeds the size cap (no object storage)', async () => {
    const big = Buffer.alloc(SERVER_DEPLOY_INLINE_TAR_LIMIT_BYTES + 1, 7);
    const agent = fakeAgent({
      readFile: vi.fn(async () => ({ content: big.toString('base64'), encoding: 'base64' as const })),
    });

    const result = await snapshotWorkspaceAppSource({ agent, deploymentId: 'dep4' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('APP_TOO_LARGE');
  });

  it('surfaces an unreachable agent instead of a silent failure', async () => {
    const agent = fakeAgent({
      runStep: vi.fn(async () => ({ exitCode: null, timedOut: false, error: 'WORKSPACE_AGENT_REQUEST_FAILED' })),
    });

    const result = await snapshotWorkspaceAppSource({ agent, deploymentId: 'dep5' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('AGENT_UNREACHABLE');
  });

  it('maps a non-zero tar exit to SNAPSHOT_FAILED', async () => {
    const agent = fakeAgent({ runStep: vi.fn(async () => ({ exitCode: 2, timedOut: false })) });
    const result = await snapshotWorkspaceAppSource({ agent, deploymentId: 'dep6' });

    expect(result.error).toBe('SNAPSHOT_FAILED');
  });

  it('rejects an empty snapshot', async () => {
    const agent = fakeAgent({ readFile: vi.fn(async () => ({ content: '', encoding: 'base64' as const })) });
    const result = await snapshotWorkspaceAppSource({ agent, deploymentId: 'dep7' });

    expect(result.error).toBe('SNAPSHOT_EMPTY');
  });
});

describe('buildServerDeployEnv', () => {
  it('sets APP_SRC_B64 + PORT + DEPLOY_ID for an inline transfer', () => {
    const env = buildServerDeployEnv({
      transfer: { kind: 'inline', base64: 'QUJD' },
      deploymentId: 'd1',
      port: 3000,
      environment: 'preview',
    });

    expect(env.APP_SRC_B64).toBe('QUJD');
    expect(env.APP_SRC_URL).toBeUndefined();
    expect(env.PORT).toBe('3000');
    expect(env.DEPLOY_ID).toBe('d1');
  });

  it('sets APP_SRC_URL for an object-storage transfer', () => {
    const env = buildServerDeployEnv({
      transfer: { kind: 'objectStorage', url: 'https://s/x.tgz', expiresAt: 'z' },
      deploymentId: 'd2',
      port: 8080,
      environment: 'preview',
    });

    expect(env.APP_SRC_URL).toBe('https://s/x.tgz');
    expect(env.APP_SRC_B64).toBeUndefined();
    expect(env.PORT).toBe('8080');
  });

  it('maps DATABASE_URL for dev and PROD_DATABASE_URL→DATABASE_URL for prod, never leaking the other', () => {
    const secrets = {
      DATABASE_URL: 'postgres://dev',
      PROD_DATABASE_URL: 'postgres://prod',
      OTHER: 'keepme',
    };

    const dev = buildServerDeployEnv({
      transfer: { kind: 'inline', base64: 'x' },
      deploymentId: 'd',
      port: 3000,
      environment: 'preview',
      projectSecrets: secrets,
    });
    expect(dev.DATABASE_URL).toBe('postgres://dev');
    expect(dev.PROD_DATABASE_URL).toBeUndefined();
    expect(dev.OTHER).toBe('keepme');

    const prod = buildServerDeployEnv({
      transfer: { kind: 'inline', base64: 'x' },
      deploymentId: 'd',
      port: 3000,
      environment: 'production',
      projectSecrets: secrets,
    });
    expect(prod.DATABASE_URL).toBe('postgres://prod');
    expect(prod.PROD_DATABASE_URL).toBeUndefined();
  });

  it('lets per-deploy env overrides win last', () => {
    const env = buildServerDeployEnv({
      transfer: { kind: 'inline', base64: 'x' },
      deploymentId: 'd',
      port: 3000,
      environment: 'preview',
      projectSecrets: { FOO: 'from-secret', DATABASE_URL: 'postgres://base' },
      envOverrides: { FOO: 'from-override', BAR: 'b', DATABASE_URL: 'postgres://override' },
    });

    expect(env.FOO).toBe('from-override');
    expect(env.BAR).toBe('b');
    expect(env.DATABASE_URL).toBe('postgres://override');
  });
});

describe('snapshotWorkspaceImageContext', () => {
  const storage = (overrides: Partial<import('./server-deploy-transfer.js').ImageContextStorage> = {}) => ({
    active: true,
    ensureBucket: vi.fn(async () => ({ bucket: 'vc-proj1', created: false, location: 'EU' })),
    createUploadUrl: vi.fn(async () => ({
      // Mirrors the real ObjectStorage.createUploadUrl (capitalized, the signed header).
      url: 'https://storage.googleapis.com/vc-proj1/tmp?sig=abc&x=1',
      headers: { 'Content-Type': 'application/gzip' },
    })),
    ...overrides,
  });

  it('tars WITH dependencies and uploads from the pod via the signed PUT URL', async () => {
    const { snapshotWorkspaceImageContext, serverDeployContextObjectKey } = await import('./server-deploy-transfer.js');
    const scripts: string[] = [];
    const agent = fakeAgent({
      runStep: vi.fn(
        async ({ args, onLine }: { args: string[]; onLine?: (l: 'info' | 'error', s: string) => void }) => {
          scripts.push(args[1]);
          onLine?.('info', '[snapshot] image context: 123456 bytes (deps included)');

          return { exitCode: 0, timedOut: false };
        },
      ),
    });

    const result = await snapshotWorkspaceImageContext({
      agent,
      deploymentId: 'dep9',
      objectStorage: storage(),
      projectId: 'proj1',
    });

    expect(result).toEqual({
      ok: true,
      bucket: 'vc-proj1',
      object: serverDeployContextObjectKey('dep9'),
      bytes: 123456,
    });

    // The tar must NOT exclude node_modules (deps ride in the image) — only VCS/internal paths.
    const tarScript = scripts[0];
    expect(tarScript).not.toContain('node_modules');
    expect(tarScript).toContain('--exclude=./.git');
    // Exactly the signed headers, once (a duplicated content-type breaks the V4 signature).
    expect(tarScript).toContain("curl -fsS -X PUT -H 'Content-Type: application/gzip'");
    expect(tarScript).not.toContain("-H 'content-type:");
    expect(tarScript).toContain(
      "--upload-file .vibecore-src-dep9.tgz 'https://storage.googleapis.com/vc-proj1/tmp?sig=abc&x=1'",
    );

    // The tarball is cleaned up from the workspace afterwards (a second pod step).
    expect(scripts.length).toBe(2);
    expect(scripts[1]).toContain('rm -f .vibecore-src-dep9.tgz');
  });

  it('is a typed error without object storage (image deploys require it)', async () => {
    const { snapshotWorkspaceImageContext } = await import('./server-deploy-transfer.js');
    const result = await snapshotWorkspaceImageContext({
      agent: fakeAgent(),
      deploymentId: 'dep9',
      objectStorage: null,
      projectId: 'proj1',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('STORAGE_UNAVAILABLE');
  });

  it('maps a failing pod step to SNAPSHOT_FAILED (no bytes seen) and reports agent unreachability', async () => {
    const { snapshotWorkspaceImageContext } = await import('./server-deploy-transfer.js');

    const failed = await snapshotWorkspaceImageContext({
      agent: fakeAgent({ runStep: vi.fn(async () => ({ exitCode: 1, timedOut: false })) }),
      deploymentId: 'dep9',
      objectStorage: storage(),
      projectId: 'proj1',
    });
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe('SNAPSHOT_FAILED');

    const unreachable = await snapshotWorkspaceImageContext({
      agent: fakeAgent({
        runStep: vi.fn(async () => ({ exitCode: null, timedOut: false, error: 'WORKSPACE_AGENT_REQUEST_FAILED' })),
      }),
      deploymentId: 'dep9',
      objectStorage: storage(),
      projectId: 'proj1',
    });
    expect(unreachable.ok).toBe(false);
    expect(unreachable.error).toBe('AGENT_UNREACHABLE');
  });

  it('flags UPLOAD_FAILED when tar succeeded (bytes logged) but the step still exited non-zero', async () => {
    const { snapshotWorkspaceImageContext } = await import('./server-deploy-transfer.js');
    const result = await snapshotWorkspaceImageContext({
      agent: fakeAgent({
        runStep: vi.fn(async ({ onLine }: { onLine?: (l: 'info' | 'error', s: string) => void }) => {
          onLine?.('info', '[snapshot] image context: 999 bytes (deps included)');

          return { exitCode: 22, timedOut: false };
        }),
      }),
      deploymentId: 'dep9',
      objectStorage: storage(),
      projectId: 'proj1',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UPLOAD_FAILED');
  });
});

describe('buildServerDeployEnv (image deploys)', () => {
  it('emits no APP_SRC_* when there is no transfer (app baked into the image)', () => {
    const env = buildServerDeployEnv({
      deploymentId: 'd',
      port: 3000,
      environment: 'preview',
      projectSecrets: { FOO: 'x' },
    });

    expect(env.APP_SRC_URL).toBeUndefined();
    expect(env.APP_SRC_B64).toBeUndefined();
    expect(env.FOO).toBe('x');
    expect(env.PORT).toBe('3000');
  });
});

describe('snapshotWorkspaceRevision', () => {
  const storage = (overrides: Partial<import('./server-deploy-transfer.js').ImageContextStorage> = {}) => ({
    active: true,
    ensureBucket: vi.fn(async () => ({ bucket: 'vc-proj1', created: false, location: 'EU' })),
    createUploadUrl: vi.fn(async () => ({
      url: 'https://storage.googleapis.com/vc-proj1/rev?sig=abc',
      headers: { 'Content-Type': 'application/gzip' },
    })),
    ...overrides,
  });

  it('tars SOURCE ONLY (deps/caches excluded), hashes it pod-side, and uploads via the signed PUT', async () => {
    const { snapshotWorkspaceRevision, serverDeployRevisionObjectKey } = await import('./server-deploy-transfer.js');
    const scripts: string[] = [];
    const sha = 'f'.repeat(64);
    const agent = fakeAgent({
      runStep: vi.fn(
        async ({ args, onLine }: { args: string[]; onLine?: (l: 'info' | 'error', s: string) => void }) => {
          scripts.push(args[1]);
          onLine?.('info', `[revision] 4242 bytes sha256=${sha}`);

          return { exitCode: 0, timedOut: false };
        },
      ),
    });

    const result = await snapshotWorkspaceRevision({
      agent,
      deploymentId: 'dep9',
      objectStorage: storage(),
      projectId: 'proj1',
    });

    expect(result).toEqual({
      ok: true,
      bucket: 'vc-proj1',
      object: serverDeployRevisionObjectKey('dep9'),
      bytes: 4242,
      sha256: sha,
    });

    // The revision is the REPLAYABLE input: derivable state must not ride along.
    const tarScript = scripts[0];
    expect(tarScript).toContain("--exclude='./node_modules'");
    expect(tarScript).toContain("--exclude='./.venv'");
    expect(tarScript).toContain("--exclude='./.git'");
    expect(tarScript).toContain("--exclude='./.cache'");
    expect(tarScript).toContain('sha256sum');
    // dist ships: a prebuilt app with no build command must keep working.
    expect(tarScript).not.toContain("--exclude='./dist'");
    expect(tarScript).toContain("curl -fsS -X PUT -H 'Content-Type: application/gzip'");

    // Cleanup step removes the workspace-root tarball.
    expect(scripts.length).toBe(2);
    expect(scripts[1]).toContain('rm -f .vibecore-src-dep9.tgz');
  });

  it('is a typed error without object storage', async () => {
    const { snapshotWorkspaceRevision } = await import('./server-deploy-transfer.js');
    const result = await snapshotWorkspaceRevision({
      agent: fakeAgent(),
      deploymentId: 'dep9',
      objectStorage: null,
      projectId: 'proj1',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('STORAGE_UNAVAILABLE');
  });

  it('distinguishes SNAPSHOT_FAILED (no bytes seen) from UPLOAD_FAILED (bytes seen, non-zero exit)', async () => {
    const { snapshotWorkspaceRevision } = await import('./server-deploy-transfer.js');

    const snapshotFailed = await snapshotWorkspaceRevision({
      agent: fakeAgent({ runStep: vi.fn(async () => ({ exitCode: 1, timedOut: false })) }),
      deploymentId: 'dep9',
      objectStorage: storage(),
      projectId: 'proj1',
    });
    expect(snapshotFailed.error).toBe('SNAPSHOT_FAILED');

    const uploadFailed = await snapshotWorkspaceRevision({
      agent: fakeAgent({
        runStep: vi.fn(async ({ onLine }: { onLine?: (l: 'info' | 'error', s: string) => void }) => {
          onLine?.('info', `[revision] 10 bytes sha256=${'a'.repeat(64)}`);

          return { exitCode: 22, timedOut: false };
        }),
      }),
      deploymentId: 'dep9',
      objectStorage: storage(),
      projectId: 'proj1',
    });
    expect(uploadFailed.error).toBe('UPLOAD_FAILED');
  });
});
