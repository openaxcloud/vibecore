import { execFile as execFileCallback } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const namespace = process.env.NETWORKPOLICY_NAMESPACE ?? process.env.WORKSPACE_NAMESPACE ?? process.env.WORKSPACE_RUNTIME_NAMESPACE ?? 'workspaces';
const podName = process.env.NETWORKPOLICY_PROBE_POD ?? 'vibecore-networkpolicy-probe';
const image = process.env.NETWORKPOLICY_PROBE_IMAGE ?? 'curlimages/curl:8.10.1';
const kubectl = process.env.KUBECTL_BIN ?? 'kubectl';
const skipPublicEgress = process.env.NETWORKPOLICY_SKIP_PUBLIC_EGRESS === '1';

type Probe = {
  name: string;
  url: string;
  shouldBeBlocked: boolean;
};

function requiredEnvList(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const internalProbeUrls = [
  'http://169.254.169.254/',
  ...requiredEnvList('NETWORKPOLICY_BLOCKED_URLS'),
  ...requiredEnvList('NETWORKPOLICY_BLOCKED_IPS').map((ip) => `https://${ip}/`),
];

if (internalProbeUrls.length === 1) {
  console.warn(
    'NETWORKPOLICY_BLOCKED_URLS or NETWORKPOLICY_BLOCKED_IPS is not set; only metadata-server egress will be checked.',
  );
}

const probes: Probe[] = [
  ...(skipPublicEgress
    ? []
    : [
        {
          name: 'public-https-egress',
          url: process.env.NETWORKPOLICY_PUBLIC_URL ?? 'https://example.com/',
          shouldBeBlocked: false,
        },
      ]),
  ...internalProbeUrls.map((url) => ({ name: `blocked-${url}`, url, shouldBeBlocked: true })),
];

function probePodManifest() {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: podName,
      namespace,
      labels: {
        'app.kubernetes.io/name': 'vibecore-workspace',
        'vibecore.ai/org-id': 'networkpolicy-probe',
        'vibecore.ai/project-id': 'networkpolicy-probe',
        'vibecore.ai/workspace-id': 'networkpolicy-probe',
      },
    },
    spec: {
      runtimeClassName: process.env.NETWORKPOLICY_PROBE_RUNTIME_CLASS ?? 'gvisor',
      restartPolicy: 'Never',
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
          name: 'probe',
          image,
          imagePullPolicy: 'IfNotPresent',
          command: ['sh', '-c', 'sleep 3600'],
          resources: {
            requests: { cpu: '50m', memory: '64Mi' },
            limits: { cpu: '100m', memory: '128Mi' },
          },
          securityContext: {
            allowPrivilegeEscalation: false,
            privileged: false,
            readOnlyRootFilesystem: true,
            runAsNonRoot: true,
            capabilities: { drop: ['ALL'] },
          },
          readinessProbe: { exec: { command: ['sh', '-c', 'true'] }, initialDelaySeconds: 1, periodSeconds: 10 },
          livenessProbe: { exec: { command: ['sh', '-c', 'true'] }, initialDelaySeconds: 1, periodSeconds: 10 },
        },
      ],
    },
  };
}

async function kubectlExec(args: string[], timeoutMs = 15_000) {
  return execFile(kubectl, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
}

async function preflightClusterAccess() {
  try {
    await kubectlExec(['version', '--client=true']);
  } catch (error) {
    throw new Error(`kubectl client is required for NetworkPolicy live validation: ${commandError(error)}`);
  }

  try {
    await kubectlExec(['cluster-info'], 20_000);
  } catch (error) {
    throw new Error(
      `Kubernetes cluster is not reachable for NetworkPolicy live validation. Configure KUBECONFIG/current-context before running this command: ${commandError(
        error,
      )}`,
    );
  }
}

async function applyProbePod() {
  const dir = await mkdtemp(join(tmpdir(), 'vibecore-networkpolicy-'));
  const manifest = join(dir, 'probe.json');

  try {
    await writeFile(manifest, JSON.stringify(probePodManifest()));
    await kubectlExec(['create', 'namespace', namespace]).catch(() => undefined);
    await kubectlExec(['-n', namespace, 'delete', 'pod', podName, '--ignore-not-found=true']);
    await kubectlExec(['apply', '-f', manifest]);
    await kubectlExec(['-n', namespace, 'wait', '--for=condition=Ready', `pod/${podName}`, '--timeout=180s'], 190_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function cleanupProbePod() {
  await kubectlExec(['-n', namespace, 'delete', 'pod', podName, '--ignore-not-found=true']).catch(() => undefined);
}

async function curlProbe(url: string) {
  return kubectlExec(
    ['-n', namespace, 'exec', podName, '--', 'curl', '-fsS', '--connect-timeout', '3', '--max-time', '6', url],
    12_000,
  );
}

async function main() {
  console.log(`networkpolicy live validation starting namespace=${namespace} pod=${podName}`);

  await preflightClusterAccess();
  await applyProbePod();

  try {
    for (const probe of probes) {
      const result = await curlProbe(probe.url)
        .then(() => ({ reachable: true }))
        .catch((error) => ({ reachable: false, error }));

      if (probe.shouldBeBlocked && result.reachable) {
        throw new Error(`NetworkPolicy failure: ${probe.name} was reachable but must be blocked`);
      }

      if (!probe.shouldBeBlocked && !result.reachable) {
        throw new Error(`NetworkPolicy failure: ${probe.name} was blocked but must be reachable`);
      }

      console.log(`${probe.shouldBeBlocked ? 'blocked' : 'allowed'} ${probe.url}`);
    }
  } finally {
    if (process.env.NETWORKPOLICY_KEEP_PROBE_POD !== '1') {
      await cleanupProbePod();
    }
  }

  console.log('networkpolicy live validation passed');
}

main().catch(async (error) => {
  await cleanupProbePod();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function commandError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
