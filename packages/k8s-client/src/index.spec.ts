import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertWorkspaceImageAllowed,
  controlledEgressNetworkPolicy,
  managerAndPreviewIngressNetworkPolicy,
  workspacePvc,
  workspaceAgentSecret,
  workspacePod,
  workspaceLimitRange,
  workspaceResourceQuota,
  workspaceRuntimeClass,
  WORKSPACE_CONTAINER_MAX_DISK_GB,
  type WorkspaceRuntimeInput,
} from './index.js';

const input: WorkspaceRuntimeInput = {
  namespace: 'workspaces',
  orgId: 'org_1',
  projectId: 'project_1',
  workspaceId: 'workspace_1',
  image: 'workspace-agent:test',
  pvcName: 'pvc-project-1',
  agentTokenSecretName: 'workspace-agent-token',
  env: { NODE_ENV: 'production' },
  secretEnv: { API_KEY: 'api-key' },
  plan: 'pro',
};

describe('workspace Kubernetes manifests', () => {
  it('builds a gVisor non-root pod with locked-down security context', () => {
    const pod = workspacePod(input);
    const container = (pod.spec?.containers as any[])[0];

    expect(pod.spec?.runtimeClassName).toBe('gvisor');
    expect(pod.spec?.tolerations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'vibecore.ai/sandbox', value: 'true' }),
        expect.objectContaining({ key: 'sandbox.gke.io/runtime', value: 'gvisor' }),
      ]),
    );
    expect(pod.spec?.securityContext).toMatchObject({
      runAsNonRoot: true,
      runAsUser: 1000,
      runAsGroup: 1000,
      fsGroup: 1000,
    });
    expect(container.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      privileged: false,
      runAsNonRoot: true,
    });
    expect(container.securityContext.capabilities.drop).toEqual(['ALL']);
    expect(pod.spec?.hostNetwork).toBe(false);
    expect(pod.spec?.hostPID).toBe(false);
    expect(pod.spec?.hostIPC).toBe(false);
    expect(pod.spec?.automountServiceAccountToken).toBe(false);
    expect(container.resources).toMatchObject({
      requests: { cpu: '500m', memory: '1Gi' },
      limits: { cpu: '2', memory: '4Gi' },
    });
    expect(JSON.stringify(pod.spec?.volumes)).not.toContain('hostPath');
  });

  it('applies plan and backend resource limits to CPU, memory and disk', () => {
    const limitedInput = { ...input, resourceLimits: { cpuMillicores: 1500, ramMb: 3072, storageGb: 30 } };
    const pod = workspacePod(limitedInput);
    const pvc = workspacePvc(limitedInput);
    const container = (pod.spec?.containers as any[])[0];

    expect(container.resources).toMatchObject({
      requests: { cpu: '375m', memory: '768Mi' },
      limits: { cpu: '1500m', memory: '3072Mi' },
    });
    expect(pvc.spec?.resources).toEqual({ requests: { storage: '30Gi' } });
  });

  it('clamps plan entitlements above the namespace LimitRange so enterprise pods are not rejected', () => {
    // The enterprise billing tier entitles 16 vCPU / 64Gi, but the workspaces
    // LimitRange caps a Container at 4 vCPU / 8Gi. Passing the entitlement through
    // verbatim made every enterprise Pod fail admission, stranding the workspace
    // with a blank editor and dead preview. Resolved limits must never exceed the
    // LimitRange max.
    const enterpriseInput = {
      ...input,
      plan: 'enterprise' as const,
      resourceLimits: { cpuMillicores: 16_000, ramMb: 65_536, storageGb: 100 },
    };
    const pod = workspacePod(enterpriseInput);
    const container = (pod.spec?.containers as any[])[0];

    expect(container.resources).toMatchObject({
      requests: { cpu: '1', memory: '2048Mi' },
      limits: { cpu: '4', memory: '8192Mi' },
    });

    const limitRangeMax = (workspaceLimitRange('workspaces').spec as any).limits[0].max;
    expect(container.resources.limits).toEqual(limitRangeMax);
    // At the per-workspace disk cap (100Gi), the entitlement passes through unchanged.
    expect(workspacePvc(enterpriseInput).spec?.resources).toEqual({ requests: { storage: '100Gi' } });
  });

  it('clamps an oversized storage entitlement to the per-workspace disk cap', () => {
    // The enterprise plan's `storage.gb: 10_000` is an account-wide allotment, but the
    // API forwarded it verbatim as the per-workspace PVC size. A 10_000Gi disk exceeds
    // the regional DISKS_TOTAL_GB quota on its own, so the CSI provisioner rejected it
    // (QUOTA_EXCEEDED), the PVC stayed Pending and the Pod never scheduled. The resolved
    // disk must never exceed WORKSPACE_CONTAINER_MAX_DISK_GB.
    const oversizedInput = {
      ...input,
      plan: 'enterprise' as const,
      resourceLimits: { cpuMillicores: 16_000, ramMb: 65_536, storageGb: 10_000 },
    };

    expect(workspacePvc(oversizedInput).spec?.resources).toEqual({
      requests: { storage: `${WORKSPACE_CONTAINER_MAX_DISK_GB}Gi` },
    });
  });

  it('pins workspace PVCs to the configured storage class', () => {
    const pvc = workspacePvc({ ...input, storageClassName: 'workspace-standard-rwo' });

    expect(pvc.spec?.storageClassName).toBe('workspace-standard-rwo');
  });

  it('injects workspace secrets only through Secret references', () => {
    const pod = workspacePod(input);
    const container = (pod.spec?.containers as any[])[0];
    const secretEnv = container.env.find((entry: any) => entry.name === 'API_KEY');

    expect(secretEnv).toEqual({
      name: 'API_KEY',
      valueFrom: { secretKeyRef: { name: 'workspace-agent-token', key: 'api-key', optional: true } },
    });
    expect(JSON.stringify(pod)).not.toContain('super-secret');
    expect(JSON.stringify(pod)).not.toContain('api-key-value');
  });

  it('rejects mutable latest workspace images in production', () => {
    expect(() => assertWorkspaceImageAllowed('vibecore/workspace-agent:latest', true)).toThrow(/pinned/);
    expect(() => assertWorkspaceImageAllowed('vibecore/workspace-agent:2026.04.0', true)).not.toThrow();
  });

  it('blocks metadata and private platform networks in controlled egress policy', () => {
    const policy = controlledEgressNetworkPolicy('workspaces');
    const egress = policy.spec?.egress as any[];
    const except = egress[1].to[0].ipBlock.except;

    expect(except).toContain('169.254.169.254/32');
    expect(except).toContain('10.0.0.0/8');
    expect(except).toContain('172.16.0.0/12');
  });

  it('adds operator-provided data-plane CIDRs to controlled egress policy', () => {
    const policy = controlledEgressNetworkPolicy('workspaces', ['10.42.0.0/24', '10.42.0.0/24', ' 10.43.0.0/24 ', '']);
    const egress = policy.spec?.egress as any[];
    const except = egress[1].to[0].ipBlock.except;

    expect(except).toContain('169.254.169.254/32');
    expect(except).toContain('10.42.0.0/24');
    expect(except).toContain('10.43.0.0/24');
    expect(except.filter((cidr: string) => cidr === '10.42.0.0/24')).toHaveLength(1);
    expect(except).not.toContain('');
  });

  it('creates agent secret and ingress policy for platform runtime callers only', () => {
    expect(workspaceAgentSecret({ ...input, tokenSecret: 'secret' })).toMatchObject({
      kind: 'Secret',
      stringData: { tokenSecret: 'secret' },
    });

    const policy = managerAndPreviewIngressNetworkPolicy('workspaces');
    expect(JSON.stringify(policy)).toContain('workspace-manager');
    expect(JSON.stringify(policy)).toContain('api');
    expect(JSON.stringify(policy)).toContain('preview-proxy');
    expect(JSON.stringify(policy)).toContain('kubernetes.io/metadata.name');
  });

  it('declares gVisor RuntimeClass', () => {
    expect(workspaceRuntimeClass()).toMatchObject({
      kind: 'RuntimeClass',
      metadata: { name: 'gvisor' },
      spec: { handler: 'runsc' },
    });
  });

  it('caps namespace-wide compute and storage consumption', () => {
    const quota = workspaceResourceQuota('workspaces');

    expect(quota.spec?.hard).toMatchObject({
      pods: '500',
      // In sync with the Helm chart's authoritative 4000Gi (under regional quota).
      'requests.storage': '4000Gi',
      persistentvolumeclaims: '500',
    });
  });

  it('ships admission policies for workspace pods', () => {
    const policy = readFileSync(
      fileURLToPath(new URL('../../../infra/admission/kyverno/workspace-security-policies.yaml', import.meta.url)),
      'utf8',
    );
    expect(policy).toContain('require-gvisor-runtime');
    expect(policy).toContain('block-privileged-workspace-pods');
    expect(policy).toContain('require-resource-limits');
    expect(policy).toContain('block-latest-tags');
    expect(policy).toContain('require-health-probes');
  });

  it('injects PROJECT_ID + object-storage env, and reserves them from tenant override', () => {
    const pod = workspacePod({
      ...input,
      // a malicious tenant tries to forge a wider-scoped token + spoof the project
      env: { OBJECT_STORAGE_ACCESS_TOKEN: 'forged', PROJECT_ID: 'someone-elses-project', MY_VAR: 'ok' },
      objectStorage: { apiUrl: 'http://api.svc:3000', accessToken: 'tok_real' },
    });
    const container = (pod.spec?.containers as any[])[0];
    const env: Array<{ name: string; value?: string }> = container.env;
    const byName = (name: string) => env.filter((e) => e.name === name).map((e) => e.value);

    // platform values present...
    expect(byName('PROJECT_ID')).toContain('project_1');
    expect(byName('OBJECT_STORAGE_API_URL')).toEqual(['http://api.svc:3000']);
    expect(byName('OBJECT_STORAGE_ACCESS_TOKEN')).toEqual(['tok_real']);
    // ...and the tenant's spoofed values are filtered out (no 'forged' / 'someone-elses-project')
    expect(byName('OBJECT_STORAGE_ACCESS_TOKEN')).not.toContain('forged');
    expect(byName('PROJECT_ID')).not.toContain('someone-elses-project');
    // a non-reserved tenant var still passes through
    expect(byName('MY_VAR')).toEqual(['ok']);
  });

  it('omits object-storage env when not provided (feature off)', () => {
    const pod = workspacePod(input);
    const env: Array<{ name: string }> = (pod.spec?.containers as any[])[0].env;
    expect(env.some((e) => e.name === 'OBJECT_STORAGE_API_URL')).toBe(false);
    expect(env.some((e) => e.name === 'OBJECT_STORAGE_ACCESS_TOKEN')).toBe(false);
    // PROJECT_ID is always injected
    expect(env.some((e) => e.name === 'PROJECT_ID')).toBe(true);
  });

  it('injects the Vite HMR proxy env so the dev server HMR websocket targets 443/wss', () => {
    const pod = workspacePod(input);
    const env: Array<{ name: string; value?: string }> = (pod.spec?.containers as any[])[0].env;
    const byName = (name: string) => env.filter((e) => e.name === name).map((e) => e.value);

    expect(byName('VITE_HMR_CLIENT_PORT')).toContain('443');
    expect(byName('VITE_HMR_PROTOCOL')).toContain('wss');
    // Host is intentionally NOT injected: the client uses the page's own hostname.
    expect(env.some((e) => e.name === 'VITE_HMR_HOST')).toBe(false);
  });
});
