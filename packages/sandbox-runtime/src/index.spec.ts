import { describe, expect, it, vi } from 'vitest';
import type { K8sObject, WorkspaceK8sClient } from '@vibecore/k8s-client';
import { GvisorPodRuntime, resolveSandboxRuntime, sandboxRuntimeCanaryIncludes, type ServerAppSpec } from './index';

function fakeK8s(overrides: Partial<WorkspaceK8sClient> = {}, applied: K8sObject[] = []): WorkspaceK8sClient {
  return {
    apply: vi.fn(async (object: K8sObject) => {
      applied.push(object);
      return object;
    }),
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

  it('stopServerApp tears down all four resources best-effort', async () => {
    const k8s = fakeK8s({ delete: vi.fn(async () => undefined) });
    const runtime = new GvisorPodRuntime(k8s);

    await runtime.stopServerApp('workspaces', 'dep1');

    const kinds = (k8s.delete as ReturnType<typeof vi.fn>).mock.calls.map((c) => `${c[0]}:${c[2]}`);
    expect(kinds).toEqual([
      'Ingress:app-dep1',
      'Service:app-dep1',
      'Deployment:app-dep1',
      'Secret:app-secrets-dep1',
    ]);
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
