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
  resolvePlanResourcesTable,
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

  it('Nix store kill switch: no nixStorePvcName ⇒ spec byte-for-byte the pre-Nix spec (no /nix mount or volume)', () => {
    const pod = workspacePod(input);
    const container = (pod.spec?.containers as any[])[0];

    // Exactly the single workspace mount/volume — nothing Nix-related leaks in.
    expect(container.volumeMounts).toEqual([{ name: 'workspace', mountPath: '/workspace' }]);
    expect(pod.spec?.volumes).toEqual([{ name: 'workspace', persistentVolumeClaim: { claimName: 'pvc-project-1' } }]);
    expect(JSON.stringify(pod)).not.toContain('/nix');
    expect(JSON.stringify(pod)).not.toContain('nix-store');
  });

  it('mounts the shared Nix store READ-ONLY at /nix when nixStorePvcName is set (opt-in)', () => {
    const pod = workspacePod({ ...input, nixStorePvcName: 'nix-store-gen1-pvc' });
    const container = (pod.spec?.containers as any[])[0];

    expect(container.volumeMounts).toContainEqual({ name: 'nix-store', mountPath: '/nix', readOnly: true });
    expect(pod.spec?.volumes).toContainEqual({
      name: 'nix-store',
      persistentVolumeClaim: { claimName: 'nix-store-gen1-pvc', readOnly: true },
    });
    // The workspace mount is still there and unchanged — Nix is additive.
    expect(container.volumeMounts).toContainEqual({ name: 'workspace', mountPath: '/workspace' });
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

  describe('resolvePlanResourcesTable (env-configurable fallback plan resources)', () => {
    it('keeps free/pro at their unchanged defaults with no override', () => {
      const table = resolvePlanResourcesTable();
      expect(table.free).toEqual({
        cpuRequest: '250m',
        memoryRequest: '512Mi',
        cpuLimit: '1',
        memoryLimit: '1Gi',
        storageRequest: '10Gi',
      });
      expect(table.pro).toEqual({
        cpuRequest: '500m',
        memoryRequest: '1Gi',
        cpuLimit: '2',
        memoryLimit: '4Gi',
        storageRequest: '20Gi',
      });
    });

    it('lowers team and enterprise cpuRequest to 500m while keeping the burstable 4-core limit', () => {
      const table = resolvePlanResourcesTable();
      expect(table.team.cpuRequest).toBe('500m');
      expect(table.team.cpuLimit).toBe('4');
      expect(table.enterprise.cpuRequest).toBe('500m');
      expect(table.enterprise.cpuLimit).toBe('4');
    });

    it('surfaces the lowered team request through the built pod spec by default', () => {
      const container = (workspacePod({ ...input, plan: 'team' }).spec?.containers as any[])[0];
      expect(container.resources).toMatchObject({
        requests: { cpu: '500m', memory: '1.5Gi' },
        limits: { cpu: '4', memory: '8Gi' },
      });
    });

    it('applies a valid WORKSPACE_PLAN_RESOURCES_JSON override to the resolved request/limit', () => {
      const table = resolvePlanResourcesTable(
        JSON.stringify({
          team: { cpuRequest: '400m', memoryRequest: '2Gi' },
          enterprise: { cpuRequest: '600m', cpuLimit: '4' },
        }),
      );
      expect(table.team.cpuRequest).toBe('400m');
      expect(table.team.memoryRequest).toBe('2Gi');
      // Untouched fields keep their defaults.
      expect(table.team.cpuLimit).toBe('4');
      expect(table.enterprise.cpuRequest).toBe('600m');
      expect(table.enterprise.cpuLimit).toBe('4');
      // Plans absent from the override are untouched.
      expect(table.free.cpuRequest).toBe('250m');
    });

    it('falls back to defaults on invalid JSON and never yields request > limit', () => {
      const table = resolvePlanResourcesTable('{not valid json');
      expect(table.team.cpuRequest).toBe('500m');
      expect(table.enterprise.cpuRequest).toBe('500m');
    });

    it('rejects malformed field values per field, keeping the default', () => {
      const table = resolvePlanResourcesTable(
        JSON.stringify({ team: { cpuRequest: 'not-a-cpu', memoryRequest: 'blah', cpuLimit: '3' } }),
      );
      // Garbage request/memory ignored → defaults; the valid cpuLimit override applies.
      expect(table.team.cpuRequest).toBe('500m');
      expect(table.team.memoryRequest).toBe('1.5Gi');
      expect(table.team.cpuLimit).toBe('3');
    });

    it('never lets an override produce request > limit (reverts the pair to defaults)', () => {
      const table = resolvePlanResourcesTable(
        JSON.stringify({ team: { cpuRequest: '4', cpuLimit: '1', memoryRequest: '8Gi', memoryLimit: '1Gi' } }),
      );
      // cpuRequest 4 > cpuLimit 1 → both revert to defaults.
      expect(table.team.cpuRequest).toBe('500m');
      expect(table.team.cpuLimit).toBe('4');
      // memoryRequest 8Gi > memoryLimit 1Gi → both revert to defaults.
      expect(table.team.memoryRequest).toBe('1.5Gi');
      expect(table.team.memoryLimit).toBe('8Gi');
    });

    it('clamps an over-max limit override to the namespace LimitRange max', () => {
      const table = resolvePlanResourcesTable(JSON.stringify({ enterprise: { cpuLimit: '16', memoryLimit: '64Gi' } }));
      // Limits above the LimitRange max (4 cpu / 8Gi) would fail admission → clamped.
      expect(table.enterprise.cpuLimit).toBe('4');
      expect(table.enterprise.memoryLimit).toBe('8192Mi');
    });

    it('lets a custom resourceLimits entitlement win over the fallback table', () => {
      // Even with a table override in play, an explicit per-workspace entitlement
      // takes precedence (request = limit/4, capped at the LimitRange max).
      const custom = { ...input, plan: 'team' as const, resourceLimits: { cpuMillicores: 2000, ramMb: 4096 } };
      const container = (workspacePod(custom).spec?.containers as any[])[0];
      expect(container.resources).toMatchObject({
        requests: { cpu: '500m', memory: '1024Mi' },
        limits: { cpu: '2', memory: '4096Mi' },
      });
    });
  });
});

describe('server deployment runtime templates', () => {
  const input = {
    deploymentId: 'dep123',
    namespace: 'vibecore-workspaces',
    orgId: 'org1',
    projectId: 'proj1',
    image: 'registry.example.com/workspace-agent:abc123',
    command: ['sh', '-c', 'npm start'],
    port: 3000,
    host: 'd-dep123.preview.e-code.ai',
    tlsSecretName: 'vibecore-preview-wildcard-tls',
    env: { APP_FLAG: 'on', PORT: '9999' },
    secretName: 'app-secrets-dep123',
    secretEnv: { DATABASE_URL: 'PROD_DATABASE_URL', API_KEY: 'API_KEY' },
    disableSandboxScheduling: true,
  };

  it('serverAppDeployment is a durable Deployment with the app port, PORT env, and optional secretKeyRefs', async () => {
    const { serverAppDeployment, serverDeploymentName } = await import('./index');
    const dep = serverAppDeployment(input) as any;

    expect(dep.kind).toBe('Deployment');
    expect(dep.apiVersion).toBe('apps/v1');
    expect(dep.metadata.name).toBe(serverDeploymentName('dep123'));
    expect(dep.spec.replicas).toBe(1);
    expect(dep.spec.strategy.rollingUpdate.maxUnavailable).toBe(0);

    const c = dep.spec.template.spec.containers[0];
    expect(c.ports[0].containerPort).toBe(3000);
    expect(c.command).toEqual(['sh', '-c', 'npm start']);

    const env = c.env as Array<{ name: string; value?: string; valueFrom?: any }>;
    // PORT is authoritative (input.port), a user PORT override is stripped.
    expect(env.filter((e) => e.name === 'PORT')).toHaveLength(1);
    expect(env.find((e) => e.name === 'PORT')?.value).toBe('3000');
    expect(env.find((e) => e.name === 'APP_FLAG')?.value).toBe('on');
    // secret-backed env references the app secret, optional so a missing key can't brick startup.
    const dbUrl = env.find((e) => e.name === 'DATABASE_URL');
    expect(dbUrl?.valueFrom.secretKeyRef).toEqual({
      name: 'app-secrets-dep123',
      key: 'PROD_DATABASE_URL',
      optional: true,
    });
    // readiness on the app port, TCP liveness.
    expect(c.readinessProbe.httpGet.port).toBe(3000);
    expect(c.livenessProbe.tcpSocket.port).toBe(3000);
    // Wake latency: 1s sampling from t=0 (a scaled-to-zero app's first visitor
    // pays this schedule), with the same 30s NotReady window as the old 6×5s.
    expect(c.readinessProbe.initialDelaySeconds).toBe(0);
    expect(c.readinessProbe.periodSeconds).toBe(1);
    expect(c.readinessProbe.failureThreshold).toBe(30);
    expect(c.readinessProbe.timeoutSeconds).toBe(5);

    // Container-level securityContext is MANDATORY: the workspaces namespace enforces
    // the `restricted` Pod Security Standard, which rejects any pod whose container
    // omits allowPrivilegeEscalation:false / capabilities.drop:[ALL]. Without this the
    // Deployment is created but every pod is denied with a PodSecurity violation.
    expect(c.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      runAsNonRoot: true,
      seccompProfile: { type: 'RuntimeDefault' },
    });
    expect(c.securityContext.capabilities.drop).toEqual(['ALL']);
  });

  it('serverAppDeployment sets ECODE_DEPLOYMENT=1 and strips a user spoof of it', async () => {
    const { serverAppDeployment } = await import('./index');
    const dep = serverAppDeployment({ ...input, env: { ...input.env, ECODE_DEPLOYMENT: '0' } }) as any;
    const env = dep.spec.template.spec.containers[0].env as Array<{ name: string; value?: string }>;

    expect(env.filter((e) => e.name === 'ECODE_DEPLOYMENT')).toHaveLength(1);
    expect(env.find((e) => e.name === 'ECODE_DEPLOYMENT')?.value).toBe('1');
  });

  it('serverAppDeployment has NO volumes/volumeMounts without a nix PVC, and mounts /nix RO with one', async () => {
    const { serverAppDeployment } = await import('./index');

    const plain = serverAppDeployment(input) as any;
    expect(plain.spec.template.spec.volumes).toBeUndefined();
    expect(plain.spec.template.spec.containers[0].volumeMounts).toBeUndefined();

    const nix = serverAppDeployment({ ...input, nixStorePvcName: 'nix-store-spike-pvc' }) as any;
    expect(nix.spec.template.spec.volumes).toEqual([
      { name: 'nix-store', persistentVolumeClaim: { claimName: 'nix-store-spike-pvc', readOnly: true } },
    ]);
    expect(nix.spec.template.spec.containers[0].volumeMounts).toEqual([
      { name: 'nix-store', mountPath: '/nix', readOnly: true },
    ]);
  });

  it('Reserved VM pins exact resources and operator placement while mounting its stable writable PVC', async () => {
    const { serverAppDeployment } = await import('./index');
    const dep = serverAppDeployment({
      ...input,
      runtimeKind: 'reserved-vm',
      persistentVolumeClaimName: 'reserved-data-dep123',
      persistentVolumeMountPath: '/var/lib/ecode',
      reservedNodeSelector: { key: 'vibecore.ai/capacity', value: 'reserved-vm' },
      reservedToleration: { key: 'vibecore.ai/capacity', value: 'reserved-vm', effect: 'NoSchedule' },
      operationId: 'operation-create-a',
      fencingToken: 1,
      cpuRequest: '2',
      cpuLimit: '2',
      memoryRequest: '8Gi',
      memoryLimit: '8Gi',
    }) as any;
    const pod = dep.spec.template.spec;
    const container = pod.containers[0];

    expect(dep.spec.replicas).toBe(1);
    expect(dep.spec.strategy).toEqual({ type: 'Recreate' });
    expect(dep.metadata.annotations).toEqual({
      'vibecore.ai/runtime-operation-id': 'operation-create-a',
      'vibecore.ai/runtime-fencing-token': '1',
    });
    expect(dep.metadata.labels['vibecore.ai/server-runtime-kind']).toBe('reserved-vm');
    expect(pod.nodeSelector).toEqual({ 'vibecore.ai/capacity': 'reserved-vm' });
    expect(pod.tolerations).toEqual(
      expect.arrayContaining([
        {
          key: 'vibecore.ai/capacity',
          operator: 'Equal',
          value: 'reserved-vm',
          effect: 'NoSchedule',
        },
      ]),
    );
    expect(container.resources).toEqual({ requests: { cpu: '2', memory: '8Gi' }, limits: { cpu: '2', memory: '8Gi' } });
    expect(container.volumeMounts).toContainEqual({ name: 'app-data', mountPath: '/var/lib/ecode', readOnly: false });
    expect(pod.volumes).toContainEqual({
      name: 'app-data',
      persistentVolumeClaim: { claimName: 'reserved-data-dep123', readOnly: false },
    });
  });

  it('Reserved VM fails closed when operator placement or persistent storage is missing', async () => {
    const { serverAppDeployment } = await import('./index');

    expect(() => serverAppDeployment({ ...input, runtimeKind: 'reserved-vm' })).toThrow(
      'RESERVED_VM_OPERATOR_CAPABILITY_REQUIRED',
    );
  });

  it('builds a stable RWO Reserved VM claim and rejects unsafe sizes', async () => {
    const { serverAppPersistentVolumeClaim } = await import('./index');
    const pvc = serverAppPersistentVolumeClaim({
      deploymentId: 'dep123',
      namespace: 'vibecore-workspaces',
      storageClassName: 'reserved-rwo',
      storageGi: 50,
      orgId: 'org1',
      projectId: 'proj1',
    }) as any;

    expect(pvc.metadata.name).toBe('reserved-data-dep123');
    expect(pvc.spec).toEqual({
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'reserved-rwo',
      resources: { requests: { storage: '50Gi' } },
    });
    expect(() =>
      serverAppPersistentVolumeClaim({
        deploymentId: 'dep123',
        namespace: 'vibecore-workspaces',
        storageClassName: 'reserved-rwo',
        storageGi: 0,
      }),
    ).toThrow('RESERVED_VM_STORAGE_SIZE_INVALID');
  });

  it('serverAppService exposes port 80 → the app targetPort', async () => {
    const { serverAppService } = await import('./index');
    const svc = serverAppService(input) as any;
    expect(svc.kind).toBe('Service');
    expect(svc.spec.ports[0]).toEqual({ name: 'http', port: 80, targetPort: 3000 });
    expect(svc.spec.selector.app).toBe('app-dep123');
  });

  it('serverAppIngress is an exact-host ingress reusing the given TLS secret', async () => {
    const { serverAppIngress } = await import('./index');
    const ing = serverAppIngress(input) as any;
    expect(ing.kind).toBe('Ingress');
    expect(ing.spec.ingressClassName).toBe('nginx');
    expect(ing.spec.rules[0].host).toBe('d-dep123.preview.e-code.ai');
    expect(ing.spec.tls[0]).toEqual({
      hosts: ['d-dep123.preview.e-code.ai'],
      secretName: 'vibecore-preview-wildcard-tls',
    });
    expect(ing.spec.rules[0].http.paths[0].backend.service.port.number).toBe(80);
  });
});
