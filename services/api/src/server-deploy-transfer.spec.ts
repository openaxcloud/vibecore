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
      projectSecrets: { FOO: 'from-secret' },
      envOverrides: { FOO: 'from-override', BAR: 'b' },
    });

    expect(env.FOO).toBe('from-override');
    expect(env.BAR).toBe('b');
  });
});
