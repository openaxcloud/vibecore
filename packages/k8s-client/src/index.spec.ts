import { describe, expect, it } from 'vitest';
import { controlledEgressNetworkPolicy, managerAndPreviewIngressNetworkPolicy, workspaceAgentSecret, workspacePod, workspaceRuntimeClass, type WorkspaceRuntimeInput } from './index.js';

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
    expect(pod.spec?.securityContext).toMatchObject({ runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 });
    expect(container.securityContext).toMatchObject({ allowPrivilegeEscalation: false, privileged: false, runAsNonRoot: true });
    expect(container.securityContext.capabilities.drop).toEqual(['ALL']);
    expect(pod.spec?.hostNetwork).toBeUndefined();
    expect(pod.spec?.hostPID).toBeUndefined();
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
});
