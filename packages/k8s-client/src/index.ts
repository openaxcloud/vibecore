import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export type WorkspacePlan = 'free' | 'pro' | 'enterprise';

export interface WorkspaceRuntimeInput {
  namespace: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
  image: string;
  pvcName: string;
  agentTokenSecretName: string;
  env: Record<string, string>;
  secretEnv: Record<string, string>;
  plan: WorkspacePlan;
  tokenSecret?: string;
}

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Record<string, string> };
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
  type?: string;
}

export interface WorkspaceK8sClient {
  apply(object: K8sObject): Promise<K8sObject>;
  delete(kind: string, namespace: string, name: string): Promise<void>;
  getPod(namespace: string, name: string): Promise<K8sObject | undefined>;
  streamPodLogs(namespace: string, name: string): AsyncIterable<string>;
}

export function assertWorkspaceImageAllowed(image: string, production = process.env.NODE_ENV === 'production') {
  if (production && /(^|:)latest$/i.test(image)) {
    throw Object.assign(new Error('Workspace images must be pinned in production'), {
      code: 'WORKSPACE_IMAGE_LATEST_FORBIDDEN',
    });
  }
}

const planResources: Record<WorkspacePlan, { cpuRequest: string; memoryRequest: string; cpuLimit: string; memoryLimit: string }> = {
  free: { cpuRequest: '250m', memoryRequest: '512Mi', cpuLimit: '1', memoryLimit: '1Gi' },
  pro: { cpuRequest: '500m', memoryRequest: '1Gi', cpuLimit: '2', memoryLimit: '4Gi' },
  enterprise: { cpuRequest: '1', memoryRequest: '2Gi', cpuLimit: '4', memoryLimit: '8Gi' },
};

function labels(input: Pick<WorkspaceRuntimeInput, 'orgId' | 'projectId' | 'workspaceId'>) {
  return {
    'app.kubernetes.io/name': 'vibecore-workspace',
    'vibecore.ai/org-id': input.orgId,
    'vibecore.ai/project-id': input.projectId,
    'vibecore.ai/workspace-id': input.workspaceId,
  };
}

export function workspacePvc(input: WorkspaceRuntimeInput): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: input.pvcName, namespace: input.namespace, labels: labels(input) },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '20Gi' } },
    },
  };
}

export function workspaceService(input: WorkspaceRuntimeInput): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: `workspace-${input.workspaceId}`, namespace: input.namespace, labels: labels(input) },
    spec: {
      selector: labels(input),
      ports: [{ name: 'agent', port: 8080, targetPort: 8080 }],
    },
  };
}

export function workspaceAgentSecret(input: WorkspaceRuntimeInput): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: input.agentTokenSecretName, namespace: input.namespace, labels: labels(input) },
    type: 'Opaque',
    stringData: {
      tokenSecret: input.tokenSecret ?? '',
    },
  };
}

export function workspacePod(input: WorkspaceRuntimeInput): K8sObject {
  assertWorkspaceImageAllowed(input.image);
  const resources = planResources[input.plan];
  const sandboxSchedulingEnabled = process.env.WORKSPACE_DISABLE_SANDBOX_SCHEDULING !== '1';
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: `workspace-${input.workspaceId}`, namespace: input.namespace, labels: labels(input) },
    spec: {
      hostNetwork: false,
      hostPID: false,
      hostIPC: false,
      ...(sandboxSchedulingEnabled
        ? {
            runtimeClassName: 'gvisor',
            nodeSelector: { 'vibecore.ai/node-pool': 'sandbox' },
            tolerations: [{ key: 'vibecore.ai/sandbox', operator: 'Equal', value: 'true', effect: 'NoSchedule' }],
          }
        : {}),
      automountServiceAccountToken: false,
      securityContext: {
        runAsNonRoot: true,
        runAsUser: 1000,
        runAsGroup: 1000,
        fsGroup: 1000,
        seccompProfile: { type: 'RuntimeDefault' },
      },
      containers: [
        {
          name: 'workspace-agent',
          image: input.image,
          ports: [{ containerPort: 8080, name: 'agent' }],
          env: [
            { name: 'WORKSPACE_ROOT', value: '/workspace' },
            { name: 'WORKSPACE_AGENT_TOKEN_SECRET', valueFrom: { secretKeyRef: { name: input.agentTokenSecretName, key: 'tokenSecret' } } },
            ...Object.entries(input.env).map(([name, value]) => ({ name, value })),
            ...Object.entries(input.secretEnv).map(([name, key]) => ({ name, valueFrom: { secretKeyRef: { name: input.agentTokenSecretName, key } } })),
          ],
          volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
          resources: {
            requests: { cpu: resources.cpuRequest, memory: resources.memoryRequest },
            limits: { cpu: resources.cpuLimit, memory: resources.memoryLimit },
          },
          readinessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 2, periodSeconds: 5 },
          livenessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 10, periodSeconds: 10 },
          securityContext: {
            allowPrivilegeEscalation: false,
            privileged: false,
            runAsNonRoot: true,
            runAsUser: 1000,
            capabilities: { drop: ['ALL'] },
            seccompProfile: { type: 'RuntimeDefault' },
          },
        },
      ],
      volumes: [{ name: 'workspace', persistentVolumeClaim: { claimName: input.pvcName } }],
    },
  };
}

export function workspaceRuntimeClass(): K8sObject {
  return {
    apiVersion: 'node.k8s.io/v1',
    kind: 'RuntimeClass',
    metadata: { name: 'gvisor' },
    spec: { handler: 'runsc' },
  };
}

export function workspaceResourceQuota(namespace: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: { name: 'workspace-runtime-quota', namespace },
    spec: {
      hard: {
        pods: '500',
        'requests.cpu': '250',
        'requests.memory': '500Gi',
        'limits.cpu': '1000',
        'limits.memory': '2Ti',
        persistentvolumeclaims: '500',
      },
    },
  };
}

export function workspaceLimitRange(namespace: string): K8sObject {
  return {
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: { name: 'workspace-runtime-limits', namespace },
    spec: {
      limits: [
        {
          type: 'Container',
          defaultRequest: { cpu: '250m', memory: '512Mi' },
          default: { cpu: '1', memory: '1Gi' },
          max: { cpu: '4', memory: '8Gi' },
        },
      ],
    },
  };
}

export function defaultDenyNetworkPolicy(namespace: string): K8sObject {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'workspace-default-deny', namespace },
    spec: { podSelector: {}, policyTypes: ['Ingress', 'Egress'] },
  };
}

export function controlledEgressNetworkPolicy(namespace: string): K8sObject {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'workspace-controlled-egress', namespace },
    spec: {
      podSelector: { matchLabels: { 'app.kubernetes.io/name': 'vibecore-workspace' } },
      policyTypes: ['Egress'],
      egress: [
        { to: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } } }], ports: [{ protocol: 'UDP', port: 53 }, { protocol: 'TCP', port: 53 }] },
        { to: [{ ipBlock: { cidr: '0.0.0.0/0', except: ['169.254.169.254/32', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'] } }], ports: [{ protocol: 'TCP', port: 443 }] },
      ],
    },
  };
}

export function managerAndPreviewIngressNetworkPolicy(namespace: string): K8sObject {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: { name: 'workspace-manager-preview-ingress', namespace },
    spec: {
      podSelector: { matchLabels: { 'app.kubernetes.io/name': 'vibecore-workspace' } },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [{ podSelector: { matchLabels: { 'app.kubernetes.io/name': 'workspace-manager' } } }],
          ports: [{ protocol: 'TCP', port: 8080 }],
        },
        {
          from: [{ podSelector: { matchLabels: { 'app.kubernetes.io/name': 'preview-proxy' } } }],
        },
      ],
    },
  };
}

export class KubectlWorkspaceK8sClient implements WorkspaceK8sClient {
  constructor(readonly kubectl = process.env.KUBECTL_BIN ?? 'kubectl') {}

  async apply(object: K8sObject) {
    const dir = await mkdtemp(join(tmpdir(), 'vibecore-k8s-'));
    const manifest = join(dir, 'object.json');

    try {
      await writeFile(manifest, JSON.stringify(object));
      await execFile(this.kubectl, ['apply', '-f', manifest]);
      return object;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async delete(kind: string, namespace: string, name: string) {
    await execFile(this.kubectl, ['delete', kind, name, '-n', namespace, '--ignore-not-found=true']);
  }

  async getPod(namespace: string, name: string) {
    const { stdout } = await execFile(this.kubectl, ['get', 'pod', name, '-n', namespace, '-o', 'json']).catch((error: any) => {
      if (error?.code === 1) {
        return { stdout: '' };
      }

      throw error;
    });

    return stdout ? (JSON.parse(stdout) as K8sObject) : undefined;
  }

  async *streamPodLogs(namespace: string, name: string) {
    const { stdout } = await execFile(this.kubectl, ['logs', name, '-n', namespace, '--tail=500']);

    for (const line of stdout.split('\n').filter(Boolean)) {
      yield line;
    }
  }
}
