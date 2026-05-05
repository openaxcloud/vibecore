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
  workspaceResourceQuota,
  workspaceRuntimeClass,
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
    expect(pod.spec?.securityContext).toMatchObject({ runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000 });
    expect(container.securityContext).toMatchObject({ allowPrivilegeEscalation: false, privileged: false, runAsNonRoot: true });
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

  it('injects workspace secrets only through Secret references', () => {
    const pod = workspacePod(input);
    const container = (pod.spec?.containers as any[])[0];
    const secretEnv = container.env.find((entry: any) => entry.name === 'API_KEY');

    expect(secretEnv).toEqual({
      name: 'API_KEY',
      valueFrom: { secretKeyRef: { name: 'workspace-agent-token', key: 'api-key' } },
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

  it('creates agent secret and ingress policy for manager and preview-proxy only', () => {
    expect(workspaceAgentSecret({ ...input, tokenSecret: 'secret' })).toMatchObject({
      kind: 'Secret',
      stringData: { tokenSecret: 'secret' },
    });

    const policy = managerAndPreviewIngressNetworkPolicy('workspaces');
    expect(JSON.stringify(policy)).toContain('workspace-manager');
    expect(JSON.stringify(policy)).toContain('preview-proxy');
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
      'requests.storage': '10Ti',
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
});
