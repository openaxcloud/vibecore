import { describe, expect, it, vi } from 'vitest';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { runScheduledJob } from './scheduled-jobs';

const baseInput = {
  namespace: 'workspaces',
  orgId: 'org1',
  projectId: 'proj1',
  taskId: 'task1',
  runId: 'run1',
  image: 'vibecore/workspace-agent:2026.04.0',
  pvcName: 'pvc-ws-abc',
  command: 'echo ok',
  timeoutSeconds: 5,
  pollIntervalMs: 1,
};

function fakeK8s(overrides: Partial<WorkspaceK8sClient> = {}, calls: string[] = []): WorkspaceK8sClient {
  return {
    apply: vi.fn(async (object: K8sObject) => {
      calls.push(`apply:${(object as any).metadata.name}`);
      return object;
    }),
    delete: vi.fn(async (kind: string, _ns: string, name: string) => {
      calls.push(`delete:${kind}:${name}`);
    }),
    get: vi.fn(async () => ({}) as K8sObject),
    getPod: vi.fn(
      async () =>
        ({
          status: { phase: 'Succeeded', containerStatuses: [{ state: { terminated: { exitCode: 0 } } }] },
        }) as unknown as K8sObject,
    ),
    // eslint-disable-next-line require-yield
    streamPodLogs: async function* () {
      return;
    },
    scale: vi.fn(async () => undefined),
    annotate: vi.fn(async () => undefined),
    listByLabel: vi.fn(async () => []),
    ...overrides,
  } as WorkspaceK8sClient;
}

describe('runScheduledJob PVC guard', () => {
  it('fails FAST with a clear message when the project volume does not exist (no pod applied)', async () => {
    const calls: string[] = [];
    const k8s = fakeK8s({ get: vi.fn(async () => undefined) }, calls);

    const result = await runScheduledJob(k8s, baseInput);

    expect(result.exitCode).toBe(1);
    expect(result.phase).toBe('Failed');
    expect(result.output).toContain('PersistentVolumeClaim "pvc-ws-abc" does not exist');
    // No pod may be created for an unschedulable run (it would hang Pending forever).
    expect(calls.filter((c) => c.startsWith('apply:'))).toEqual([]);
  });

  it('runs normally when the volume exists', async () => {
    const result = await runScheduledJob(fakeK8s(), baseInput);

    expect(result.exitCode).toBe(0);
    expect(result.phase).toBe('Succeeded');
  });
});
