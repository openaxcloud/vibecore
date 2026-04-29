import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertWorkspaceImageAllowed,
  controlledEgressNetworkPolicy,
  managerAndPreviewIngressNetworkPolicy,
  workspaceAgentSecret,
  workspacePod,
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
    expect(JSON.stringify(pod.spec?.volumes)).not.toContain('hostPath');
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
