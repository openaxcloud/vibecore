import { describe, expect, it, vi } from 'vitest';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { GvisorPodRuntime, resolveSandboxRuntime, sandboxRuntimeCanaryIncludes, type ServerAppSpec } from './index';

function fakeK8s(overrides: Partial<WorkspaceK8sClient> = {}, applied: K8sObject[] = []): WorkspaceK8sClient {
  return {
    apply: vi.fn(async (object: K8sObject) => {
      applied.push(object);
      return object;
    }),
    applyFenced: vi.fn(async (object: K8sObject) => {
      applied.push(object);
      return object;
    }),
    deleteFenced: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => ({ status: { readyReplicas: 1, replicas: 1 } }) as unknown as K8sObject),
    getPod: vi.fn(async () => undefined),
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

const spec: ServerAppSpec = {
  deploymentId: 'dep1',
  namespace: 'workspaces',
  image: 'vibecore/workspace-agent:2026.04.0',
  port: 3000,
  host: 'd-dep1.preview.example',
  tlsSecretName: 'tls',
  readyTimeoutMs: 1000,
};

describe('GvisorPodRuntime', () => {
  it('advertises measured capabilities (no cow/suspend/gpu/fuse; egress policy yes)', () => {
    const runtime = new GvisorPodRuntime(fakeK8s());

    expect(runtime.id).toBe('gvisor-pod');
    expect(runtime.capabilities).toMatchObject({
      cowSnapshot: false,
      suspendResume: false,
      gpu: false,
      fuse: false,
      egressPolicy: true,
      nestedVirtualization: false,
    });
    expect(runtime.capabilities.architectures).toEqual(['amd64']);
  });

  it('startServerApp applies Deployment + Service (no Ingress by default) and reports readiness', async () => {
    const applied: K8sObject[] = [];
    const runtime = new GvisorPodRuntime(fakeK8s({}, applied), 1);

    const result = await runtime.startServerApp(spec);

    expect(applied.map((o) => (o as any).kind)).toEqual(['Deployment', 'Service']);
    expect(result).toEqual({ ready: true, url: 'https://d-dep1.preview.example', name: 'app-dep1', readyReplicas: 1 });
  });

  it('startServerApp applies the Ingress only when asked', async () => {
    const applied: K8sObject[] = [];
    const runtime = new GvisorPodRuntime(fakeK8s({}, applied), 1);

    await runtime.startServerApp({ ...spec, createIngress: true });

    expect(applied.map((o) => (o as any).kind)).toEqual(['Deployment', 'Service', 'Ingress']);
  });

  it('proves the fenced Reserved VM rollout generation before reporting readiness', async () => {
    const applied: K8sObject[] = [];
    let deployment: K8sObject | undefined;
    const k8s = fakeK8s(
      {
        applyFenced: vi.fn(async (object: K8sObject) => {
          deployment = {
            ...object,
            metadata: { ...object.metadata, resourceVersion: '2', generation: 7 },
            status: {
              observedGeneration: 7,
              updatedReplicas: 1,
              availableReplicas: 1,
              readyReplicas: 1,
              replicas: 1,
            },
          };
          applied.push(object);
          return deployment;
        }),
        get: vi.fn(async (kind: string) => (kind === 'Deployment' ? deployment : undefined)),
      },
      applied,
    );
    const runtime = new GvisorPodRuntime(k8s, 1);

    const result = await runtime.startServerApp({
      ...spec,
      runtimeKind: 'reserved-vm',
      persistentVolumeClaimName: 'reserved-data-dep1',
      reservedNodeSelector: { key: 'vibecore.ai/capacity', value: 'reserved-vm' },
      reservedToleration: { key: 'vibecore.ai/capacity', value: 'reserved-vm', effect: 'NoSchedule' },
      operationId: 'operation-create-a',
      fencingToken: 1,
    });

    expect(result).toMatchObject({ ready: true, appliedFencingToken: 1 });
    expect(deployment?.metadata.annotations).toMatchObject({
      'vibecore.ai/runtime-operation-id': 'operation-create-a',
      'vibecore.ai/runtime-fencing-token': '1',
    });
  });

  it('stopServerApp tears down all four resources and proves they are absent', async () => {
    const k8s = fakeK8s({ delete: vi.fn(async () => undefined), get: vi.fn(async () => undefined) });
    const runtime = new GvisorPodRuntime(k8s);

    await runtime.stopServerApp('workspaces', 'dep1');

    const kinds = (k8s.delete as ReturnType<typeof vi.fn>).mock.calls.map((c) => `${c[0]}:${c[2]}`);
    expect(kinds).toEqual(['Ingress:app-dep1', 'Service:app-dep1', 'Deployment:app-dep1', 'Secret:app-secrets-dep1']);
    expect(k8s.get).toHaveBeenCalledTimes(4);
  });

  it('fails closed when teardown leaves a resource or its absence cannot be read', async () => {
    const remaining = new GvisorPodRuntime(
      fakeK8s({
        get: vi.fn(async (kind: string) =>
          kind === 'Deployment' ? ({ metadata: { name: 'app-dep1' } } as K8sObject) : undefined,
        ),
      }),
    );
    await expect(remaining.stopServerApp('workspaces', 'dep1')).rejects.toMatchObject({
      code: 'SERVER_DEPLOY_CLEANUP_UNVERIFIED',
    });

    const unreadable = new GvisorPodRuntime(
      fakeK8s({
        get: vi.fn(async () => {
          throw new Error('Kubernetes read forbidden');
        }),
      }),
    );
    await expect(unreadable.stopServerApp('workspaces', 'dep1')).rejects.toMatchObject({
      code: 'SERVER_DEPLOY_CLEANUP_UNVERIFIED',
    });
  });

  it('serverAppStatus maps a missing Deployment to exists:false', async () => {
    const runtime = new GvisorPodRuntime(fakeK8s({ get: vi.fn(async () => undefined) }));

    expect(await runtime.serverAppStatus('workspaces', 'ghost')).toEqual({
      exists: false,
      readyReplicas: 0,
      replicas: 0,
    });
  });
});

describe('resolveSandboxRuntime', () => {
  it('defaults to gvisor-pod (unset env = kill switch)', () => {
    expect(resolveSandboxRuntime(fakeK8s(), {}).id).toBe('gvisor-pod');
  });

  it('refuses an unknown runtime id instead of silently falling back', () => {
    expect(() => resolveSandboxRuntime(fakeK8s(), { SANDBOX_RUNTIME: 'firecracker' })).toThrow(
      /Unknown sandbox runtime/,
    );
  });
});

describe('sandboxRuntimeCanaryIncludes', () => {
  it("matches '*', exact ids, and nothing when unset", () => {
    expect(sandboxRuntimeCanaryIncludes('p1', { SANDBOX_RUNTIME_PROJECTS: '*' })).toBe(true);
    expect(sandboxRuntimeCanaryIncludes('p1', { SANDBOX_RUNTIME_PROJECTS: 'p1,p2' })).toBe(true);
    expect(sandboxRuntimeCanaryIncludes('p3', { SANDBOX_RUNTIME_PROJECTS: 'p1,p2' })).toBe(false);
    expect(sandboxRuntimeCanaryIncludes('p1', {})).toBe(false);
  });
});
