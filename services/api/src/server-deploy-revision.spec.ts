import { describe, expect, it, vi } from 'vitest';
import { appPublicEnglish } from './app-public-copy.js';
import {
  buildImageContextFromRevision,
  describeEcodeLockFailure,
  type AppBuildRunPayload,
} from './server-deploy-revision.js';
import { assertLockAgainstRegistry, assertLockPublishable, parseNixGenerationRegistry } from '@vibecore/k8s-client';
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
  runAppBuild: vi.fn(async () => ({
    exitCode: 0,
    output: '[build] uploaded artifact\n',
    timedOut: false,
    phase: 'Succeeded',
  })),
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
    expect(result.message).toBe(appPublicEnglish('SERVER_REVISION_BUILD_FAILED'));
    expect(result.message).not.toContain('npm ERR! boom');
    expect(lines.join('\n')).toContain('npm ERR! boom');
  });

  it('fails typed on build timeout', async () => {
    const result = await buildImageContextFromRevision(
      baseOpts({
        runAppBuild: vi.fn(async () => ({ exitCode: 124, output: '', timedOut: true, phase: 'Running' })),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe(appPublicEnglish('SERVER_REVISION_BUILD_TIMEOUT'));
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

/*
 * RR-08 point 1 — the persisted publish failure MUST carry the typed code.
 * This exercises the exact production chain: the same assertLockAgainstRegistry
 * the publish path calls, caught by the same describeEcodeLockFailure that
 * shapes the persisted deployment error/log line.
 */
describe('describeEcodeLockFailure (typed code survives into the artifact)', () => {
  const registryWithRevokedGen2 = () =>
    parseNixGenerationRegistry(
      JSON.stringify({
        schemaVersion: 1,
        generations: [
          {
            id: 'gen-2',
            status: 'REVOKED',
            catalogSha256: `sha256:${'a'.repeat(64)}`,
            nixVersion: '2.34.8',
            nixpkgs: { channel: 'nixos-26.05', rev: '8eeec934ae0dbeca3d7868c059568a65c08b2fc3' },
            zones: { 'europe-west9-a': 'nix-store-v2-pvc' },
            bundles: [{ name: 'python312', storePath: '/nix/store/aaa-env-python', sha256: 'c'.repeat(64) }],
            publishedAt: '2026-07-15T15:43:48Z',
            revokedAt: '2026-07-23T19:30:00Z',
            revokedReason: 'RR-08 automated negative',
          },
          {
            id: 'gen-3',
            status: 'ACTIVE',
            catalogSha256: `sha256:${'b'.repeat(64)}`,
            nixVersion: '2.34.8',
            nixpkgs: { channel: 'nixos-26.05', rev: '8eeec934ae0dbeca3d7868c059568a65c08b2fc3' },
            zones: { 'europe-west9-a': 'nix-store-v3-pvc' },
            bundles: [{ name: 'python312', storePath: '/nix/store/bbb-env-python', sha256: 'd'.repeat(64) }],
            publishedAt: '2026-07-23T00:00:00Z',
          },
        ],
      }),
    );

  it('REQUIRES ECODE_LOCK_GENERATION_REVOKED in the persisted line for a revoked-generation lock', () => {
    const registry = registryWithRevokedGen2();
    const lock = {
      lockVersion: 1 as const,
      storeGeneration: 'gen-2',
      nixpkgsRev: '8eeec934ae0dbeca3d7868c059568a65c08b2fc3',
      bundles: [{ name: 'python312', storePath: '/nix/store/aaa-env-python', sha256: 'c'.repeat(64) }],
    };

    let failure: ReturnType<typeof describeEcodeLockFailure> | null = null;

    try {
      assertLockAgainstRegistry(lock, registry);
    } catch (error) {
      failure = describeEcodeLockFailure(error);
    }

    // The publish path persists failure.logLine — the literal code is REQUIRED.
    expect(failure).not.toBeNull();
    expect(failure!.code).toBe('ECODE_LOCK_GENERATION_REVOKED');
    expect(failure!.logLine).toContain('ECODE_LOCK_GENERATION_REVOKED');
    expect(failure!.logLine).toContain('REVOKED');
    expect(failure!.message).toContain('gen-2');
  });

  it('preserves the code for every lock failure class (unpinned, tampered, unknown bundle)', () => {
    const registry = registryWithRevokedGen2();
    const gen3Lock = {
      lockVersion: 1 as const,
      storeGeneration: 'gen-3',
      nixpkgsRev: '8eeec934ae0dbeca3d7868c059568a65c08b2fc3',
      bundles: [{ name: 'python312', storePath: '/nix/store/bbb-env-python', sha256: 'd'.repeat(64) }],
    };

    const cases: Array<[() => void, string]> = [
      [() => assertLockPublishable({ ...gen3Lock, storeGeneration: 'active' }), 'ECODE_LOCK_UNPINNED'],
      [
        () =>
          assertLockAgainstRegistry(
            { ...gen3Lock, bundles: [{ ...gen3Lock.bundles[0], sha256: '0'.repeat(64) }] },
            registry,
          ),
        'ECODE_LOCK_BUNDLE_TAMPERED',
      ],
      [
        () =>
          assertLockAgainstRegistry(
            {
              ...gen3Lock,
              bundles: [...gen3Lock.bundles, { name: 'ghc', storePath: '/nix/store/x', sha256: 'e'.repeat(64) }],
            },
            registry,
          ),
        'ECODE_LOCK_BUNDLE_UNKNOWN',
      ],
    ];

    for (const [run, expectedCode] of cases) {
      let failure: ReturnType<typeof describeEcodeLockFailure> | null = null;

      try {
        run();
      } catch (error) {
        failure = describeEcodeLockFailure(error);
      }

      expect(failure?.code, expectedCode).toBe(expectedCode);
      expect(failure?.logLine).toContain(expectedCode);
    }
  });

  it('degrades an untyped error to ECODE_LOCK_INVALID (never a missing code)', () => {
    const failure = describeEcodeLockFailure(new Error('boom'));
    expect(failure.code).toBe('ECODE_LOCK_INVALID');
    expect(failure.logLine).toBe('ECODE_LOCK_INVALID: boom');
  });
});
