import { describe, expect, it, vi } from 'vitest';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { runAppBuild } from './app-builds';

const baseInput = {
  namespace: 'workspaces',
  deploymentId: 'dep1',
  image: 'vibecore/workspace-agent:2026.04.0',
  revisionUrl: 'https://storage.example/rev.tgz?sig=1',
  artifactUrl: 'https://storage.example/ctx.tgz?sig=2',
  artifactHeaders: { 'Content-Type': 'application/gzip' },
  buildCommand: 'npm install && npm run build',
  timeoutSeconds: 30,
  pollIntervalMs: 1,
};

function fakeK8s(overrides: Partial<WorkspaceK8sClient> & { calls?: string[] }): WorkspaceK8sClient {
  const calls = overrides.calls ?? [];

  return {
    apply: async (object: K8sObject) => {
      calls.push(`apply:${(object as any).kind}:${(object as any).metadata.name}`);
      return object;
    },
    delete: async (kind: string, _ns: string, name: string) => {
      calls.push(`delete:${kind}:${name}`);
    },
    get: async () => undefined,
    getPod: async () => undefined,
    // eslint-disable-next-line require-yield
    streamPodLogs: async function* () {
      return;
    },
    scale: async () => undefined,
    annotate: async () => undefined,
    listByLabel: async () => [],
    ...overrides,
  } as WorkspaceK8sClient;
}

const terminatedPod = (phase: 'Succeeded' | 'Failed', exitCode: number): K8sObject =>
  ({
    status: { phase, containerStatuses: [{ state: { terminated: { exitCode } } }] },
  }) as unknown as K8sObject;

describe('runAppBuild', () => {
  it('applies the build pod, returns exit code + logs, and always deletes the pod', async () => {
    const calls: string[] = [];
    const k8s = fakeK8s({
      calls,
      getPod: async () => terminatedPod('Succeeded', 0),
      streamPodLogs: async function* () {
        yield '[build] uploaded artifact\n';
      },
    });

    const result = await runAppBuild(k8s, baseInput);

    expect(result.exitCode).toBe(0);
    expect(result.phase).toBe('Succeeded');
    expect(result.output).toContain('uploaded artifact');

    // pre-clean, apply, post-clean — the pod never outlives the call.
    expect(calls).toEqual([
      'delete:pod:app-build-dep1',
      'apply:Pod:app-build-dep1',
      'delete:pod:app-build-dep1',
    ]);
  });

  it('reports a failed build with its exit code and logs', async () => {
    const k8s = fakeK8s({
      getPod: async () => terminatedPod('Failed', 1),
      streamPodLogs: async function* () {
        yield 'npm ERR! peer dep hell\n';
      },
    });

    const result = await runAppBuild(k8s, baseInput);

    expect(result.exitCode).toBe(1);
    expect(result.phase).toBe('Failed');
    expect(result.output).toContain('npm ERR!');
  });

  it('times out (exit 124) and still deletes the pod when it never terminates', async () => {
    const calls: string[] = [];
    const k8s = fakeK8s({
      calls,
      getPod: async () => ({ status: { phase: 'Running' } }) as unknown as K8sObject,
    });

    const result = await runAppBuild(k8s, { ...baseInput, timeoutSeconds: 0 });

    expect(result.exitCode).toBe(124);
    expect(result.timedOut).toBe(true);
    expect(calls.at(-1)).toBe('delete:pod:app-build-dep1');
  });

  it('rejects an unpinned image in production before touching the cluster', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    try {
      const calls: string[] = [];
      const k8s = fakeK8s({ calls });

      await expect(runAppBuild(k8s, { ...baseInput, image: 'vibecore/workspace-agent:latest' })).rejects.toThrow(
        'pinned',
      );
      expect(calls).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
